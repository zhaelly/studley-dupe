const CHOICE_LINE =
  /^[\(\[]?\s*([A-Za-z])[\)\].:\-]\s+(.+)$|^([A-Za-z])\)\s+(.+)$|^([A-Za-z])\s+[-–—]\s+(.+)$/;

const QUESTION_LINE =
  /^(?:(?:Q(?:uestion)?|Question)\s*)?(\d+)\s*[:.)]\s*(.+)$|^(Q\s*\d*\s*[:.)]\s*)(.+)$/i;

const ANSWER_LINE =
  /^(?:ANSWER|ANS|CORRECT|Correct(?:\s+Answer)?|Key|Solution)\s*[:.]?\s*(.+)$/i;

function normalizeQuestion(raw, allowMissingAnswer = false) {
  const text = (raw.text || raw.question || raw.q || "").trim();
  let choices = raw.choices || raw.options || raw.answers || [];
  if (!Array.isArray(choices)) choices = [];

  choices = choices.map((c) => String(c).trim()).filter(Boolean);
  if (!text || choices.length < 2) return null;

  let correctIndex = -1;

  if (typeof raw.correctIndex === "number" && raw.correctIndex >= 0 && raw.correctIndex < choices.length) {
    correctIndex = raw.correctIndex;
  } else if (typeof raw.answer === "number" && raw.answer >= 0 && raw.answer < choices.length) {
    correctIndex = raw.answer;
  } else {
    const answer = raw.answer ?? raw.correct ?? raw.correctAnswer ?? raw.key;
    if (typeof answer === "number" && answer >= 0 && answer < choices.length) {
      correctIndex = answer;
    } else if (typeof answer === "string") {
      correctIndex = resolveAnswerIndex(answer.trim(), choices);
    }
  }

  if (correctIndex < 0) {
    if (!allowMissingAnswer) return null;
    return { text, choices, correctIndex: null };
  }

  return { text, choices, correctIndex };
}

function resolveAnswerIndex(answer, choices) {
  const letterMatch = answer.match(/^([A-Za-z])$/);
  if (letterMatch) return letterMatch[1].toUpperCase().charCodeAt(0) - 65;

  const prefixed = answer.match(/^([A-Za-z])[.)]\s*(.*)$/);
  if (prefixed) {
    const idx = prefixed[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < choices.length) return idx;
  }

  return choices.findIndex((c) => c.toLowerCase() === answer.toLowerCase());
}

function parseJson(content) {
  const data = JSON.parse(content);
  const list = Array.isArray(data) ? data : data.questions || data.items || [];
  if (!Array.isArray(list)) throw new Error("JSON must contain a questions array.");

  const complete = [];
  const needsReview = [];

  for (const item of list) {
    const withAnswer = normalizeQuestion(item, false);
    if (withAnswer) {
      complete.push(withAnswer);
      continue;
    }
    const withoutAnswer = normalizeQuestion(item, true);
    if (withoutAnswer) needsReview.push(withoutAnswer);
  }

  if (!complete.length && !needsReview.length) {
    throw new Error("No valid questions found in JSON file.");
  }

  return { complete, needsReview };
}

function parseStructuredBlocks(content) {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const complete = [];
  const needsReview = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    let text = "";
    const choices = [];
    let correctIndex = -1;
    let i = 0;

    const qMatch = lines[0].match(QUESTION_LINE);
    if (qMatch) {
      text = (qMatch[2] || qMatch[3] || "").trim();
      i = 1;
    } else if (lines[0].endsWith("?")) {
      text = lines[0];
      i = 1;
    } else {
      text = lines[0];
      i = 1;
    }

    for (; i < lines.length; i++) {
      const line = lines[i];
      const answerMatch = line.match(ANSWER_LINE);
      const choiceMatch = line.match(CHOICE_LINE);

      if (answerMatch) {
        correctIndex = resolveAnswerIndex(answerMatch[1].trim(), choices);
      } else if (choiceMatch) {
        choices.push((choiceMatch[2] || choiceMatch[4] || choiceMatch[6] || "").trim());
      } else if (!choices.length) {
        text += " " + line;
      }
    }

    if (!text || choices.length < 2) continue;

    if (correctIndex >= 0 && correctIndex < choices.length) {
      complete.push({ text, choices, correctIndex });
    } else {
      needsReview.push({ text, choices, correctIndex: null });
    }
  }

  return { complete, needsReview };
}

function isQuestionStart(line) {
  if (QUESTION_LINE.test(line)) return true;
  if (line.endsWith("?") && line.length >= 8) return true;
  if (/^\d+\.\s+.+/.test(line) && (line.includes("?") || line.length > 20)) return true;
  return false;
}

function parseLineScanner(content) {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const complete = [];
  const needsReview = [];
  let i = 0;

  while (i < lines.length) {
    if (!isQuestionStart(lines[i])) {
      i++;
      continue;
    }

    let text = lines[i];
    const qMatch = text.match(QUESTION_LINE);
    if (qMatch) text = (qMatch[2] || qMatch[3] || text).trim();
    i++;

    const choices = [];
    let correctIndex = -1;

    while (i < lines.length) {
      const line = lines[i];

      if (isQuestionStart(line) && choices.length >= 2) break;

      const answerMatch = line.match(ANSWER_LINE);
      if (answerMatch) {
        correctIndex = resolveAnswerIndex(answerMatch[1].trim(), choices);
        i++;
        continue;
      }

      const choiceMatch = line.match(CHOICE_LINE);
      if (choiceMatch) {
        choices.push((choiceMatch[2] || choiceMatch[4] || choiceMatch[6] || "").trim());
        i++;
        continue;
      }

      if (!choices.length && !ANSWER_LINE.test(line) && !isQuestionStart(line)) {
        text += " " + line;
        i++;
        continue;
      }

      break;
    }

    if (text && choices.length >= 2) {
      const question = { text: text.trim(), choices };
      if (correctIndex >= 0 && correctIndex < choices.length) {
        question.correctIndex = correctIndex;
        complete.push(question);
      } else {
        question.correctIndex = null;
        needsReview.push(question);
      }
    }
  }

  return { complete, needsReview };
}

function mergeResults(...results) {
  const complete = [];
  const needsReview = [];
  const seen = new Set();

  for (const result of results) {
    for (const q of [...result.complete, ...result.needsReview]) {
      const key = `${q.text}::${q.choices.join("|")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (q.correctIndex === null || q.correctIndex === undefined) needsReview.push(q);
      else complete.push(q);
    }
  }

  return { complete, needsReview };
}

function parseDocumentContent(content, filename) {
  const ext = (filename || "").split(".").pop()?.toLowerCase();

  if (ext === "json") {
    return parseJson(content);
  }

  try {
    const jsonResult = parseJson(content);
    if (jsonResult.complete.length || jsonResult.needsReview.length) return jsonResult;
  } catch {
    /* fall through to text parsing */
  }

  const blockResult = parseStructuredBlocks(content);
  const scanResult = parseLineScanner(content);
  const merged = mergeResults(blockResult, scanResult);

  if (!merged.complete.length && !merged.needsReview.length) {
    throw new Error(
      "Could not find multiple-choice questions in this file. Make sure it includes a question and choices like A) B) C), or upload a structured .txt / .json file."
    );
  }

  return merged;
}

function parseFile(content, filename) {
  const result = parseDocumentContent(content, filename);
  return [...result.complete, ...result.needsReview.map((q) => ({ ...q, correctIndex: q.correctIndex ?? 0 }))];
}

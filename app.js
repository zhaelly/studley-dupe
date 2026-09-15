const STORAGE_KEY = "studley-data";
const LEGACY_KEY = "studley-exam";
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

let state = loadState();
let examAnswers = [];
let examQuestions = [];
let currentQuestionIndex = 0;

const views = {
  home: document.getElementById("view-home"),
  build: document.getElementById("view-build"),
  exam: document.getElementById("view-exam"),
  stats: document.getElementById("view-stats"),
  results: document.getElementById("view-results"),
};

const navTabs = document.querySelectorAll(".nav-tab");
const subjectsList = document.getElementById("subjects-list");
const addSubjectBtn = document.getElementById("add-subject-btn");
const activeSubjectTitle = document.getElementById("active-subject-title");
const activeSubjectMeta = document.getElementById("active-subject-meta");
const sidebarToggle = document.getElementById("sidebar-toggle");

const questionForm = document.getElementById("question-form");
const questionText = document.getElementById("question-text");
const choicesList = document.getElementById("choices-list");
const addChoiceBtn = document.getElementById("add-choice-btn");
const questionsPreview = document.getElementById("questions-preview");
const questionCount = document.getElementById("question-count");
const startExamBtn = document.getElementById("start-exam-btn");

const uploadZone = document.getElementById("upload-zone");
const fileInput = document.getElementById("file-input");
const pasteInput = document.getElementById("paste-input");
const pasteImportBtn = document.getElementById("paste-import-btn");
const uploadStatus = document.getElementById("upload-status");

// Home and topics elements
const homeSubjects = document.getElementById('home-subjects');
const homeAddSubject = document.getElementById('home-add-subject');
const topicsList = document.getElementById('topics-list');
const addTopicBtn = document.getElementById('add-topic-btn');

const importModal = document.getElementById("import-modal");
const importModalDesc = document.getElementById("import-modal-desc");
const importReviewList = document.getElementById("import-review-list");
const importConfirmBtn = document.getElementById("import-confirm-btn");
const importCancelBtn = document.getElementById("import-cancel-btn");
const importModalBackdrop = document.getElementById("import-modal-backdrop");

let pendingImport = { complete: [], needsReview: [], filename: "" };

const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const examQuestionNumber = document.getElementById("exam-question-number");
const examQuestionText = document.getElementById("exam-question-text");
const examChoices = document.getElementById("exam-choices");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const submitExamBtn = document.getElementById("submit-exam-btn");

const statsOverview = document.getElementById("stats-overview");
const statsBySubject = document.getElementById("stats-by-subject");
const statsRecent = document.getElementById("stats-recent");
const statsWeak = document.getElementById("stats-weak");

const scorePercent = document.getElementById("score-percent");
const scoreSummary = document.getElementById("score-summary");
const reviewBtn = document.getElementById("review-btn");
const retakeBtn = document.getElementById("retake-btn");
const backToBuildBtn = document.getElementById("back-to-build-btn");
const reviewList = document.getElementById("review-list");
const reviewItems = document.getElementById("review-items");
const toast = document.getElementById("toast");

function genId() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultState() {
  return { subjects: [], activeSubjectId: null, activeTopicId: null, stats: { attempts: [], questionStats: {} } };
}

function migrateLegacy() {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return null;
    const questions = JSON.parse(legacy);
    if (!Array.isArray(questions) || !questions.length) return null;
    const id = genId();
    return {
      subjects: [{ id, name: "General", questions, createdAt: Date.now() }],
      activeSubjectId: id,
      stats: { attempts: [], questionStats: {} },
    };
  } catch {
    return null;
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* fall through */ }

  const migrated = migrateLegacy();
  if (migrated) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  }

  return defaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getActiveSubject() {
  return state.subjects.find((s) => s.id === state.activeSubjectId) || null;
}

function getQuestions() {
  const topic = getActiveTopic();
  if (topic && Array.isArray(topic.questions)) return topic.questions;
  const subject = getActiveSubject();
  return (subject && Array.isArray(subject.questions) && subject.questions) || [];
}

function renderHome() {
  if (!homeSubjects) return;
  if (!state.subjects.length) {
    homeSubjects.innerHTML = '<p class="empty-state">No subjects yet — create one using the button.</p>';
    return;
  }

  homeSubjects.innerHTML = state.subjects
    .map((s) => `
      <div class="panel" style="min-width:160px;padding:0.75rem;cursor:pointer;" data-id="${s.id}">
        <strong style="display:block;margin-bottom:0.25rem">${escapeHtml(s.name)}</strong>
        <small class="muted">${(Array.isArray(s.questions) ? s.questions.length : (Array.isArray(s.topics) ? s.topics.reduce((a,t)=>a+(t.questions?.length||0),0) : 0))} question(s)</small>
      </div>
    `)
    .join('');

  homeSubjects.querySelectorAll('.panel').forEach((card) => {
    card.addEventListener('click', () => {
      selectSubject(card.dataset.id);
      switchView('build');
    });
  });
}

function getActiveTopic() {
  const subject = getActiveSubject();
  if (!subject) return null;
  if (Array.isArray(subject.topics)) return subject.topics.find((t) => t.id === state.activeTopicId) || subject.topics[0] || null;
  return null;
}

function renderTopics() {
  if (!topicsList) return;
  const subject = getActiveSubject();
  if (!subject) {
    topicsList.innerHTML = '<span class="muted">Select a subject to manage topics</span>';
    return;
  }

  // initialize topics for legacy subjects
  if (!Array.isArray(subject.topics)) {
    subject.topics = [{ id: genId(), name: 'General', questions: subject.questions || [] }];
    delete subject.questions;
    saveState();
  }

  topicsList.innerHTML = subject.topics
    .map((t) => `
      <div class="topic-item" style="display:inline-flex;align-items:center;gap:0.25rem;">
        <button class="btn btn-ghost btn-sm topic-select" data-id="${t.id}">${escapeHtml(t.name)}</button>
        <button class="btn btn-ghost btn-sm topic-delete" data-id="${t.id}" title="Delete topic">×</button>
      </div>
    `)
    .join('');

  topicsList.querySelectorAll('.topic-select').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTopicId = btn.dataset.id;
      saveState();
      renderQuestionsPreview();
      renderHeader();
    });
  });

  topicsList.querySelectorAll('.topic-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTopic(btn.dataset.id);
    });
  });
}

function deleteTopic(topicId) {
  const subject = getActiveSubject();
  if (!subject || !Array.isArray(subject.topics)) return;
  const topic = subject.topics.find((t) => t.id === topicId);
  if (!topic) return;
  if (!confirm(`Delete topic "${topic.name}" and its questions?`)) return;

  subject.topics = subject.topics.filter((t) => t.id !== topicId);

  if (state.activeTopicId === topicId) {
    state.activeTopicId = subject.topics[0]?.id || null;
  }

  saveState();
  renderTopics();
  renderQuestionsPreview();
  renderHeader();
  showToast('Topic deleted', 'info');
}

function showToast(message, type = "info") {
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function switchView(viewName) {
  Object.entries(views).forEach(([name, el]) => {
    el.classList.toggle("active", name === viewName);
  });

  navTabs.forEach((tab) => {
    const tabView = tab.dataset.view;
    tab.classList.toggle("active", tabView === viewName);
    tab.setAttribute("aria-selected", tabView === viewName ? "true" : "false");
    if (tabView === "results") tab.hidden = viewName !== "results";
  });

  if (viewName === "stats") renderStats();
}

function renderSubjects() {
  if (!state.subjects.length) {
    subjectsList.innerHTML = '<p class="sidebar-empty">No subjects yet</p>';
    return;
  }

  subjectsList.innerHTML = state.subjects
    .map(
      (s) => `
      <div class="subject-item ${s.id === state.activeSubjectId ? "active" : ""}" data-id="${s.id}">
        <button type="button" class="subject-select" data-id="${s.id}">
          <span class="subject-icon">📁</span>
          <span class="subject-info">
            <span class="subject-name">${escapeHtml(s.name)}</span>
            <span class="subject-count">${(Array.isArray(s.questions) ? s.questions.length : (Array.isArray(s.topics) ? s.topics.reduce((a,t)=>a+(t.questions?.length||0),0) : 0))} question${(Array.isArray(s.questions) ? s.questions.length : (Array.isArray(s.topics) ? s.topics.reduce((a,t)=>a+(t.questions?.length||0),0) : 0)) === 1 ? "" : "s"}</span>
          </span>
        </button>
        <button type="button" class="subject-add-topic" data-id="${s.id}" title="Add topic">＋</button>
        <button type="button" class="subject-rename" data-id="${s.id}" title="Rename">✎</button>
        <button type="button" class="subject-delete" data-id="${s.id}" title="Delete">×</button>
      </div>
    `
    )
    .join("");

  subjectsList.querySelectorAll(".subject-select").forEach((btn) => {
    btn.addEventListener("click", () => selectSubject(btn.dataset.id));
  });

  subjectsList.querySelectorAll(".subject-rename").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      renameSubject(btn.dataset.id);
    });
  });

  subjectsList.querySelectorAll(".subject-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSubject(btn.dataset.id);
    });
  });

  subjectsList.querySelectorAll('.subject-add-topic').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addTopicForSubject(btn.dataset.id);
    });
  });
}

function addTopicForSubject(subjectId) {
  const subject = state.subjects.find((s) => s.id === subjectId);
  if (!subject) return;
  const name = prompt('Topic name:', 'New Topic');
  if (!name?.trim()) return;
  if (!Array.isArray(subject.topics)) subject.topics = [{ id: genId(), name: 'General', questions: subject.questions || [] }];
  const topic = { id: genId(), name: name.trim(), questions: [] };
  subject.topics.push(topic);
  state.activeSubjectId = subjectId;
  state.activeTopicId = topic.id;
  saveState();
  renderAll();
  showToast(`Added topic "${topic.name}" to ${subject.name}`, 'success');
}

function selectSubject(id) {
  state.activeSubjectId = id;
  const subject = state.subjects.find((s) => s.id === id);
  if (subject) {
    if (Array.isArray(subject.topics) && subject.topics.length) state.activeTopicId = subject.topics[0].id;
    else state.activeTopicId = null;
  }
  saveState();
  renderAll();
  document.querySelector(".layout")?.classList.remove("sidebar-open");
}

function addSubject() {
  const name = prompt("Subject name:", "New Subject");
  if (!name?.trim()) return;

  const subject = { id: genId(), name: name.trim(), topics: [{ id: genId(), name: 'General', questions: [] }], createdAt: Date.now() };
  state.subjects.push(subject);
  state.activeSubjectId = subject.id;
  state.activeTopicId = subject.topics[0].id;
  saveState();
  renderAll();
  showToast(`Created "${subject.name}"`, "success");
}

function addTopic() {
  const subject = getActiveSubject();
  if (!subject) {
    showToast('Select a subject first', 'error');
    return;
  }
  const name = prompt('Topic name:', 'New Topic');
  if (!name?.trim()) return;
  if (!Array.isArray(subject.topics)) subject.topics = [{ id: genId(), name: 'General', questions: [] }];
  const topic = { id: genId(), name: name.trim(), questions: [] };
  subject.topics.push(topic);
  state.activeTopicId = topic.id;
  saveState();
  renderTopics();
  renderQuestionsPreview();
}

function renameSubject(id) {
  const subject = state.subjects.find((s) => s.id === id);
  if (!subject) return;
  const name = prompt("Rename subject:", subject.name);
  if (!name?.trim() || name.trim() === subject.name) return;
  subject.name = name.trim();
  saveState();
  renderAll();
}

function deleteSubject(id) {
  const subject = state.subjects.find((s) => s.id === id);
  if (!subject) return;
  if (!confirm(`Delete "${subject.name}" and all its questions?`)) return;

  state.subjects = state.subjects.filter((s) => s.id !== id);
  state.stats.attempts = state.stats.attempts.filter((a) => a.subjectId !== id);
  delete state.stats.questionStats[id];

  if (state.activeSubjectId === id) {
    state.activeSubjectId = state.subjects[0]?.id || null;
  }

  saveState();
  renderAll();
  showToast("Subject deleted", "info");
}

function renderHeader() {
  const subject = getActiveSubject();
  if (!subject) {
    activeSubjectTitle.textContent = "Select a subject";
    activeSubjectMeta.textContent = "Create or pick a subject folder to get started";
    return;
  }
  const topic = getActiveTopic();
  const count = topic ? (topic.questions?.length || 0) : (Array.isArray(subject.questions) ? subject.questions.length : (Array.isArray(subject.topics) ? subject.topics.reduce((a,t)=>a+(t.questions?.length||0),0) : 0));
  activeSubjectTitle.textContent = subject.name;
  activeSubjectMeta.textContent = topic
    ? `${count} question${count === 1 ? "" : "s"} in topic "${topic.name}"`
    : `${count} question${count === 1 ? "" : "s"} in this folder`;
}

function createChoiceRow(value = "", isCorrect = false) {
  const row = document.createElement("div");
  row.className = "choice-row" + (isCorrect ? " is-correct" : "");

  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "correct-answer";
  radio.checked = isCorrect;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter choice text";
  input.value = value;
  input.required = true;

  const label = document.createElement("span");
  label.className = "correct-label";
  label.textContent = isCorrect ? "Correct ✓" : "Mark correct";

  radio.addEventListener("change", () => {
    choicesList.querySelectorAll(".choice-row").forEach((r) => {
      r.classList.remove("is-correct");
      r.querySelector(".correct-label").textContent = "Mark correct";
    });
    row.classList.add("is-correct");
    label.textContent = "Correct ✓";
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-remove-choice";
  removeBtn.title = "Remove choice";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => {
    if (choicesList.children.length <= 2) return;
    const wasCorrect = radio.checked;
    row.remove();
    if (wasCorrect) {
      const first = choicesList.querySelector(".choice-row");
      first.querySelector('input[type="radio"]').checked = true;
      first.classList.add("is-correct");
      first.querySelector(".correct-label").textContent = "Correct ✓";
    }
  });

  row.append(radio, input, label, removeBtn);
  return row;
}

function resetForm() {
  questionText.value = "";
  choicesList.innerHTML = "";
  choicesList.append(createChoiceRow("", true));
  choicesList.append(createChoiceRow());
}

function getFormData() {
  const text = questionText.value.trim();
  const rows = [...choicesList.querySelectorAll(".choice-row")];
  const choices = rows.map((row) => row.querySelector('input[type="text"]').value.trim());
  const correctIndex = rows.findIndex((row) => row.querySelector('input[type="radio"]').checked);

  if (!text || choices.some((c) => !c) || choices.length < 2) return null;
  return { text, choices, correctIndex };
}

function renderQuestionsPreview() {
  const subject = getActiveSubject();
  const questions = getQuestions();

  questionCount.textContent = questions.length;
  const hasSubject = !!subject;
  const canExam = hasSubject && questions.length > 0;

  startExamBtn.disabled = !canExam;
  document.querySelector('.nav-tab[data-view="exam"]').disabled = !canExam;
  questionForm.querySelector("button[type=submit]").disabled = !hasSubject;
  addChoiceBtn.disabled = !hasSubject;
  questionText.disabled = !hasSubject;

  if (!hasSubject) {
    questionsPreview.innerHTML = '<p class="empty-state">Create a subject folder first, then add or import questions.</p>';
    return;
  }

  if (!questions.length) {
    questionsPreview.innerHTML = '<p class="empty-state">No questions yet. Add manually or import a file above.</p>';
    return;
  }

  questionsPreview.innerHTML = questions
    .map(
      (q, i) => `
      <article class="preview-card">
        <div class="preview-card-header">
          <span class="preview-q-num">Question ${i + 1}</span>
          <button type="button" class="btn-delete-q" data-index="${i}">Delete</button>
        </div>
        <p class="preview-question">${escapeHtml(q.text)}</p>
        <ul class="preview-choices">
          ${q.choices
            .map((c, j) => `<li class="${j === q.correctIndex ? "correct" : ""}">${escapeHtml(c)}</li>`)
            .join("")}
        </ul>
      </article>
    `
    )
    .join("");

  questionsPreview.querySelectorAll(".btn-delete-q").forEach((btn) => {
    btn.addEventListener("click", () => {
      const topic = getActiveTopic();
      if (topic && Array.isArray(topic.questions)) topic.questions.splice(Number(btn.dataset.index), 1);
      else if (subject.questions) subject.questions.splice(Number(btn.dataset.index), 1);
      saveState();
      renderQuestionsPreview();
      renderSubjects();
      renderHeader();
    });
  });
}

function importQuestions(parsed) {
  const subject = getActiveSubject();
  if (!subject) {
    showToast("Create or select a subject first", "error");
    return 0;
  }
  const topic = getActiveTopic();
  if (topic && Array.isArray(topic.questions)) {
    topic.questions.push(...parsed);
  } else {
    subject.questions = subject.questions || [];
    subject.questions.push(...parsed);
  }
  saveState();
  renderAll();
  return parsed.length;
}

function setUploadBusy(busy) {
  if (uploadZone) uploadZone.classList.toggle("disabled", busy);
  if (fileInput) fileInput.disabled = busy;
  if (pasteInput) pasteInput.disabled = busy;
  if (pasteImportBtn) pasteImportBtn.disabled = busy;
}

function allReviewQuestionsAnswered() {
  return pendingImport.needsReview.every((q) => q.correctIndex !== null && q.correctIndex >= 0);
}

function updateImportConfirmState() {
  importConfirmBtn.disabled = !allReviewQuestionsAnswered();
}

function closeImportModal() {
  importModal.hidden = true;
  pendingImport = { complete: [], needsReview: [], filename: "" };
  importReviewList.innerHTML = "";
}

function renderImportReviewModal() {
  const total = pendingImport.complete.length + pendingImport.needsReview.length;
  const needsCount = pendingImport.needsReview.length;

  importModalDesc.textContent =
    needsCount === total
      ? `Found ${total} question${total === 1 ? "" : "s"} in ${pendingImport.filename}. Assign the correct answer for each before importing.`
      : `Found ${total} questions in ${pendingImport.filename}. ${needsCount} need a correct answer assigned — the rest already have answers marked.`;

  importReviewList.innerHTML = pendingImport.needsReview
    .map(
      (q, i) => `
      <div class="import-review-card" data-index="${i}">
        <p class="import-review-q"><span>Q${i + 1}.</span> ${escapeHtml(q.text)}</p>
        <div class="import-review-choices">
          ${q.choices
            .map(
              (choice, j) => `
              <label class="import-choice ${q.correctIndex === j ? "selected" : ""}">
                <input type="radio" name="import-q-${i}" value="${j}" ${q.correctIndex === j ? "checked" : ""} />
                <span class="choice-letter">${letters[j]}</span>
                <span>${escapeHtml(choice)}</span>
              </label>
            `
            )
            .join("")}
        </div>
      </div>
    `
    )
    .join("");

  importReviewList.querySelectorAll(".import-review-card").forEach((card) => {
    const index = Number(card.dataset.index);
    card.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        pendingImport.needsReview[index].correctIndex = Number(radio.value);
        card.querySelectorAll(".import-choice").forEach((label) => label.classList.remove("selected"));
        radio.closest(".import-choice").classList.add("selected");
        updateImportConfirmState();
      });
    });
  });

  updateImportConfirmState();
  importModal.hidden = false;
}

function finalizeImport() {
  const filename = pendingImport.filename;
  const all = [
    ...pendingImport.complete,
    ...pendingImport.needsReview.map((q) => ({
      text: q.text,
      choices: q.choices,
      correctIndex: q.correctIndex,
    })),
  ];

  const count = importQuestions(all);
  closeImportModal();

  uploadStatus.textContent = `Imported ${count} question${count === 1 ? "" : "s"} from ${filename || "file"}`;
  uploadStatus.className = "upload-status success";
  uploadStatus.hidden = false;

  showToast(`Imported ${count} question${count === 1 ? "" : "s"}`, "success");
}

function processParseResult(result, filename) {
  pendingImport = {
    complete: result.complete,
    needsReview: result.needsReview,
    filename,
  };

  const total = result.complete.length + result.needsReview.length;

  if (result.needsReview.length > 0) {
    renderImportReviewModal();
    uploadStatus.textContent = `Found ${total} question${total === 1 ? "" : "s"} — assign answers to finish importing.`;
    uploadStatus.className = "upload-status success";
    uploadStatus.hidden = false;
    return;
  }

  const count = importQuestions(result.complete);
  uploadStatus.textContent = `Imported ${count} question${count === 1 ? "" : "s"} from ${filename}`;
  uploadStatus.className = "upload-status success";
  uploadStatus.hidden = false;
  showToast(`Imported ${count} question${count === 1 ? "" : "s"} from ${filename}`, "success");
}

async function handleFile(file) {
  if (!file) return;

  uploadStatus.hidden = true;

  if (!getActiveSubject()) {
    showToast("Create or select a subject first", "error");
    return;
  }

  const fileName = (file.name || "").toLowerCase();
  const fileType = (file.type || "").toLowerCase();
  const isTextOnly = ["txt", "text", "json"].includes(fileName.split(".").pop() || "") || fileType.startsWith("text/") || fileType === "application/json";

  if (!isTextOnly) {
    uploadStatus.textContent = "Only text files (.txt, .text, .json) are supported.";
    uploadStatus.className = "upload-status error";
    uploadStatus.hidden = false;
    showToast("Only text files (.txt, .text, .json) are supported.", "error");
    fileInput.value = "";
    return;
  }

  setUploadBusy(true);

  try {
    const content = await extractTextFromFile(file);
    const result = parseDocumentContent(content, file.name);
    processParseResult(result, file.name);
  } catch (err) {
    uploadStatus.textContent = err.message || "Failed to analyze file";
    uploadStatus.className = "upload-status error";
    uploadStatus.hidden = false;
    showToast(err.message || "Could not analyze file", "error");
  } finally {
    setUploadBusy(false);
    fileInput.value = "";
  }
}

function startExam() {
  const questions = getQuestions();
  if (!questions.length) return;

  examQuestions = shuffle(questions).map((question) => {
    const choices = shuffle(question.choices.map((choice, index) => ({
      choice,
      isCorrect: index === question.correctIndex,
    })));

    return {
      ...question,
      choices: choices.map(({ choice }) => choice),
      correctIndex: choices.findIndex(({ isCorrect }) => isCorrect),
    };
  });
  examAnswers = new Array(questions.length).fill(null);
  currentQuestionIndex = 0;
  reviewList.hidden = true;
  switchView("exam");
  renderExamQuestion();
}

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function renderExamQuestion() {
  const questions = examQuestions;
  const q = questions[currentQuestionIndex];
  const total = questions.length;
  const answered = currentQuestionIndex + 1;

  progressFill.style.width = `${(answered / total) * 100}%`;
  progressLabel.textContent = `Question ${answered} of ${total}`;
  examQuestionNumber.textContent = `Question ${answered}`;
  examQuestionText.textContent = q.text;

  examChoices.innerHTML = q.choices
    .map(
      (choice, i) => `
      <button type="button" class="exam-choice ${examAnswers[currentQuestionIndex] === i ? "selected" : ""}" data-index="${i}">
        <span class="choice-letter">${letters[i]}</span>
        <span>${escapeHtml(choice)}</span>
      </button>
    `
    )
    .join("");

  examChoices.querySelectorAll(".exam-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      examAnswers[currentQuestionIndex] = Number(btn.dataset.index);
      examChoices.querySelectorAll(".exam-choice").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });

  prevBtn.disabled = currentQuestionIndex === 0;
  const isLast = currentQuestionIndex === total - 1;
  nextBtn.hidden = isLast;
  submitExamBtn.hidden = !isLast;
}

function recordStats(correct, total, questionResults) {
  const subject = getActiveSubject();
  if (!subject) return;

  const percent = total ? Math.round((correct / total) * 100) : 0;
  const attempt = {
    id: genId(),
    subjectId: subject.id,
    subjectName: subject.name,
    date: Date.now(),
    score: percent,
    correct,
    total,
    questionResults,
  };

  state.stats.attempts.unshift(attempt);

  if (!state.stats.questionStats[subject.id]) {
    state.stats.questionStats[subject.id] = {};
  }

  questionResults.forEach((r) => {
    const key = String(r.questionIndex);
    if (!state.stats.questionStats[subject.id][key]) {
      state.stats.questionStats[subject.id][key] = { correct: 0, incorrect: 0, text: r.text };
    }
    if (r.correct) state.stats.questionStats[subject.id][key].correct++;
    else state.stats.questionStats[subject.id][key].incorrect++;
  });

  saveState();
}

function submitExam() {
  const questions = examQuestions;
  const correct = questions.reduce(
    (acc, q, i) => acc + (examAnswers[i] === q.correctIndex ? 1 : 0),
    0
  );
  const total = questions.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;

  const questionResults = questions.map((q, i) => ({
    questionIndex: i,
    text: q.text,
    correct: examAnswers[i] === q.correctIndex,
  }));

  recordStats(correct, total, questionResults);

  scorePercent.textContent = `${percent}%`;
  scoreSummary.textContent = `You got ${correct} out of ${total} questions correct.`;

  renderReview();
  switchView("results");
}

function renderReview() {
  const questions = examQuestions;
  reviewItems.innerHTML = questions
    .map((q, i) => {
      const selected = examAnswers[i];
      const isCorrect = selected === q.correctIndex;
      const isUnanswered = selected === null;

      let statusClass = "incorrect";
      let statusText = "Incorrect";
      if (isUnanswered) {
        statusClass = "unanswered";
        statusText = "Not answered";
      } else if (isCorrect) {
        statusClass = "correct";
        statusText = "Correct";
      }

      const yourAnswer = selected !== null ? q.choices[selected] : "—";
      const correctAnswer = q.choices[q.correctIndex];

      return `
        <div class="review-item">
          <span class="review-status ${statusClass}">${statusText}</span>
          <h3>Q${i + 1}. ${escapeHtml(q.text)}</h3>
          <p class="review-answer-line">Your answer: <strong>${escapeHtml(yourAnswer)}</strong></p>
          ${!isCorrect ? `<p class="review-answer-line">Correct answer: <strong>${escapeHtml(correctAnswer)}</strong></p>` : ""}
        </div>
      `;
    })
    .join("");
}

function computeGlobalStats() {
  const attempts = state.stats.attempts;
  const totalAttempts = attempts.length;
  const avgScore = totalAttempts
    ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / totalAttempts)
    : 0;
  const bestScore = totalAttempts ? Math.max(...attempts.map((a) => a.score)) : 0;
  const totalQuestions = state.subjects.reduce((s, sub) => {
    if (Array.isArray(sub.questions)) return s + sub.questions.length;
    if (Array.isArray(sub.topics)) return s + sub.topics.reduce((a, t) => a + (t.questions?.length || 0), 0);
    return s;
  }, 0);

  return { totalAttempts, avgScore, bestScore, totalQuestions, totalSubjects: state.subjects.length };
}

function computeSubjectStats(subjectId) {
  const attempts = state.stats.attempts.filter((a) => a.subjectId === subjectId);
  if (!attempts.length) return null;

  return {
    attempts: attempts.length,
    avgScore: Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length),
    bestScore: Math.max(...attempts.map((a) => a.score)),
    lastAttempt: attempts[0].date,
  };
}

function renderStats() {
  const global = computeGlobalStats();

  statsOverview.innerHTML = `
    <div class="stat-card"><span class="stat-value">${global.totalSubjects}</span><span class="stat-label">Subjects</span></div>
    <div class="stat-card"><span class="stat-value">${global.totalQuestions}</span><span class="stat-label">Total questions</span></div>
    <div class="stat-card"><span class="stat-value">${global.totalAttempts}</span><span class="stat-label">Exams taken</span></div>
    <div class="stat-card"><span class="stat-value">${global.avgScore}%</span><span class="stat-label">Average score</span></div>
    <div class="stat-card highlight"><span class="stat-value">${global.bestScore}%</span><span class="stat-label">Best score</span></div>
  `;

  if (!state.subjects.length) {
    statsBySubject.innerHTML = '<p class="empty-state">No subjects yet.</p>';
  } else {
    statsBySubject.innerHTML = state.subjects
      .map((s) => {
        const sub = computeSubjectStats(s.id);
        return `
          <div class="subject-stat-row">
            <div>
                <strong>${escapeHtml(s.name)}</strong>
                <span class="subject-stat-meta">${(Array.isArray(s.questions) ? s.questions.length : (Array.isArray(s.topics) ? s.topics.reduce((a,t)=>a+(t.questions?.length||0),0) : 0))} questions</span>
            </div>
            <div class="subject-stat-scores">
              ${
                sub
                  ? `<span>Avg ${sub.avgScore}%</span><span>Best ${sub.bestScore}%</span><span>${sub.attempts} attempt${sub.attempts === 1 ? "" : "s"}</span>`
                  : '<span class="muted">No attempts yet</span>'
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  if (!state.stats.attempts.length) {
    statsRecent.innerHTML = '<p class="empty-state">Take an exam to see your history here.</p>';
  } else {
    statsRecent.innerHTML = state.stats.attempts
      .slice(0, 10)
      .map(
        (a) => `
        <div class="recent-row">
          <div>
            <strong>${escapeHtml(a.subjectName)}</strong>
            <span class="recent-date">${formatDate(a.date)}</span>
          </div>
          <span class="recent-score ${a.score >= 70 ? "good" : a.score >= 50 ? "ok" : "low"}">${a.score}%</span>
          <span class="recent-detail">${a.correct}/${a.total} correct</span>
        </div>
      `
      )
      .join("");
  }

  renderWeakQuestions();
}

function renderWeakQuestions() {
  const subject = getActiveSubject();
  if (!subject) {
    statsWeak.innerHTML = '<p class="empty-state">Select a subject to see weak areas.</p>';
    return;
  }

  const qStats = state.stats.questionStats[subject.id] || {};
  const weak = Object.entries(qStats)
    .map(([index, data]) => ({
      index: Number(index),
      ...data,
      missRate: data.incorrect / (data.correct + data.incorrect),
    }))
    .filter((q) => q.incorrect > 0)
    .sort((a, b) => b.missRate - a.missRate || b.incorrect - a.incorrect)
    .slice(0, 5);

  if (!weak.length) {
    statsWeak.innerHTML = '<p class="empty-state">No missed questions yet for this subject — keep studying!</p>';
    return;
  }

  const questions = Array.isArray(subject.questions)
    ? subject.questions
    : Array.isArray(subject.topics)
    ? subject.topics.flatMap((t) => t.questions || [])
    : [];
  statsWeak.innerHTML = weak
    .map((w) => {
      const text = questions[w.index]?.text || w.text || `Question ${w.index + 1}`;
      const total = w.correct + w.incorrect;
      return `
        <div class="weak-row">
          <p class="weak-text">${escapeHtml(text)}</p>
          <span class="weak-meta">Missed ${w.incorrect}/${total} times (${Math.round(w.missRate * 100)}%)</span>
        </div>
      `;
    })
    .join("");
}

function renderAll() {
  renderSubjects();
  renderHeader();
  renderQuestionsPreview();
  renderHome();
  renderTopics();
}

// Event listeners
addSubjectBtn.addEventListener("click", addSubject);

sidebarToggle.addEventListener("click", () => {
  document.querySelector(".layout").classList.toggle("sidebar-open");
});

questionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const subject = getActiveSubject();
  if (!subject) {
    showToast("Create or select a subject first", "error");
    return;
  }

  const data = getFormData();
  if (!data) return;

  const topic = getActiveTopic();
  if (topic && Array.isArray(topic.questions)) {
    topic.questions.push(data);
  } else {
    subject.questions = subject.questions || [];
    subject.questions.push(data);
  }
  saveState();
  renderQuestionsPreview();
  renderSubjects();
  renderHeader();
  resetForm();
  questionText.focus();
});

// home and topic controls
homeAddSubject?.addEventListener('click', addSubject);
addTopicBtn?.addEventListener('click', addTopic);

addChoiceBtn.addEventListener("click", () => choicesList.append(createChoiceRow()));

startExamBtn.addEventListener("click", startExam);

uploadZone?.addEventListener("click", () => fileInput?.click());
uploadZone?.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("dragover");
});
uploadZone?.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
uploadZone?.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  handleFile(e.dataTransfer.files[0]);
});
fileInput?.addEventListener("change", () => handleFile(fileInput.files[0]));
pasteImportBtn?.addEventListener("click", () => {
  const text = pasteInput?.value?.trim() || "";
  if (!text) {
    uploadStatus.textContent = "Paste some exam text first.";
    uploadStatus.className = "upload-status error";
    uploadStatus.hidden = false;
    showToast("Paste some exam text first.", "error");
    return;
  }

  if (!getActiveSubject()) {
    showToast("Create or select a subject first", "error");
    return;
  }

  setUploadBusy(true);

  try {
    const result = parseDocumentContent(text, "pasted-text.txt");
    processParseResult(result, "pasted text");
    pasteInput.value = "";
  } catch (err) {
    uploadStatus.textContent = err.message || "Failed to analyze pasted text";
    uploadStatus.className = "upload-status error";
    uploadStatus.hidden = false;
    showToast(err.message || "Could not analyze pasted text", "error");
  } finally {
    setUploadBusy(false);
  }
});

importConfirmBtn.addEventListener("click", () => {
  if (!allReviewQuestionsAnswered()) return;
  finalizeImport();
});

importCancelBtn.addEventListener("click", closeImportModal);
importModalBackdrop.addEventListener("click", closeImportModal);

prevBtn.addEventListener("click", () => {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    renderExamQuestion();
  }
});

nextBtn.addEventListener("click", () => {
  if (currentQuestionIndex < examQuestions.length - 1) {
    currentQuestionIndex++;
    renderExamQuestion();
  }
});

submitExamBtn.addEventListener("click", submitExam);
reviewBtn.addEventListener("click", () => { reviewList.hidden = !reviewList.hidden; });
retakeBtn.addEventListener("click", startExam);
backToBuildBtn.addEventListener("click", () => switchView("build"));

navTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.disabled) return;
    const view = tab.dataset.view;
    if (view === "exam") startExam();
    else if (view !== "results") switchView(view);
  });
});

// Init
resetForm();
renderAll();
// Start on home if no subject selected
if (!state.activeSubjectId) switchView('home');
else switchView('build');

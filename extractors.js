const DOCUMENT_EXTENSIONS = ["pdf", "pptx", "docx", "doc"];

function getFileExtension(filename) {
  return (filename || "").split(".").pop()?.toLowerCase() || "";
}

function isDocumentFile(filename) {
  return DOCUMENT_EXTENSIONS.includes(getFileExtension(filename));
}

function extractParagraphsFromXml(xml, paragraphTag, textTag) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paragraphs = doc.getElementsByTagName(paragraphTag);
  const lines = [];

  for (const paragraph of paragraphs) {
    const textNodes = paragraph.getElementsByTagName(textTag);
    let line = "";
    for (const node of textNodes) line += node.textContent;
    if (line.trim()) lines.push(line.trim());
  }

  return lines;
}

async function extractFromPdf(arrayBuffer) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF library failed to load. Check your internet connection and refresh.");
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    let lastY = null;
    let line = "";
    const pageLines = [];

    for (const item of content.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        if (line.trim()) pageLines.push(line.trim());
        line = item.str;
      } else {
        line += (line && !line.endsWith("-") ? " " : "") + item.str;
      }
      lastY = y;
    }

    if (line.trim()) pageLines.push(line.trim());
    pages.push(pageLines.join("\n"));
  }

  return pages.join("\n\n");
}

async function extractFromPptx(arrayBuffer) {
  if (typeof JSZip === "undefined") {
    throw new Error("Archive library failed to load. Check your internet connection and refresh.");
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const num = (path) => Number(path.match(/slide(\d+)/)[1]);
      return num(a) - num(b);
    });

  if (!slidePaths.length) {
    throw new Error("No slides found in this PowerPoint file.");
  }

  const slides = [];
  for (const path of slidePaths) {
    const xml = await zip.files[path].async("text");
    slides.push(extractParagraphsFromXml(xml, "a:p", "a:t").join("\n"));
  }

  return slides.filter(Boolean).join("\n\n");
}

async function extractFromDocx(arrayBuffer) {
  if (typeof JSZip === "undefined") {
    throw new Error("Archive library failed to load. Check your internet connection and refresh.");
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const docEntry = zip.file("word/document.xml");
  if (!docEntry) throw new Error("Invalid Word document.");

  const xml = await docEntry.async("text");
  return extractParagraphsFromXml(xml, "w:p", "w:t").join("\n");
}

async function extractTextFromFile(file) {
  const ext = getFileExtension(file.name);

  if (ext === "doc") {
    throw new Error("Old .ppt / .doc files are not supported. Save as .pptx or .docx and try again.");
  }

  if (ext === "pdf") {
    return extractFromPdf(await file.arrayBuffer());
  }

  if (ext === "pptx") {
    return extractFromPptx(await file.arrayBuffer());
  }

  if (ext === "docx") {
    return extractFromDocx(await file.arrayBuffer());
  }

  return file.text();
}

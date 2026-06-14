import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

// Common names used on lab reports for each marker key
const ALIASES = {
  ldl:               ['ldl cholesterol', 'ldl-c', 'ldl-cholesterol', 'ldl'],
  hdl:               ['hdl cholesterol', 'hdl-c', 'hdl-cholesterol', 'hdl'],
  total_cholesterol: ['cholesterol, total', 'total cholesterol', 'cholesterol total'],
  triglycerides:     ['triglycerides', 'triglyceride', 'trig'],
  glucose:           ['glucose, fasting', 'fasting glucose', 'blood glucose', 'glucose'],
  hba1c:             ['hemoglobin a1c', 'glycated hemoglobin', 'hba1c', 'a1c'],
  crp:               ['c-reactive protein', 'hs-crp', 'high sensitivity crp', 'crp'],
  vitamin_d:         ['25-oh vitamin d', '25(oh)d', '25-hydroxyvitamin d', 'vitamin d, 25', 'vitamin d3', 'vitamin d'],
  vitamin_b12:       ['vitamin b-12', 'vitamin b12', 'cobalamin', 'b12'],
  tsh:               ['thyroid stimulating hormone', 'thyrotropin', 'tsh'],
  free_t3:           ['triiodothyronine, free', 'free t3', 'ft3', 't3, free'],
  free_t4:           ['thyroxine, free', 'free t4', 'ft4', 't4, free'],
  testosterone:      ['testosterone, total', 'total testosterone', 'testosterone'],
  albumin:           ['albumin, serum', 'serum albumin', 'albumin'],
  creatinine:        ['creatinine, serum', 'serum creatinine', 'creatinine'],
  lymphocyte:        ['lymphocyte %', 'lymphocytes %', 'lymphocyte percent', 'lymphocytes', 'lymphocyte'],
  mcv:               ['mean corpuscular volume', 'mean cell volume', 'mcv'],
  rdw:               ['red cell distribution width', 'rdw-cv', 'rdw-sd', 'rdw'],
  alk_phos:          ['alkaline phosphatase', 'alk phosphatase', 'alk phos', 'alp'],
  wbc:               ['white blood cell count', 'white blood cells', 'leukocyte count', 'wbc'],
  hemoglobin:        ['hemoglobin, total', 'hemoglobin'],
  alt:               ['alanine aminotransferase', 'alanine transaminase', 'alt/sgpt', 'alt'],
  ast:               ['aspartate aminotransferase', 'aspartate transaminase', 'ast/sgot', 'ast'],
  egfr:              ['estimated gfr', 'egfr', 'gfr'],
  uric_acid:         ['uric acid, serum', 'uric acid'],
  ferritin:          ['ferritin, serum', 'serum ferritin', 'ferritin'],
  iron:              ['iron, serum', 'serum iron', 'iron'],
  homocysteine:      ['homocysteine, plasma', 'plasma homocysteine', 'homocysteine'],
  insulin:           ['insulin, fasting', 'fasting insulin', 'insulin'],
};

async function extractTextFromPdf(arrayBuffer) {
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join items with spaces; newline between pages
    fullText += content.items.map((item) => item.str).join(' ') + '\n';
  }
  return fullText;
}

function parseLabValues(text) {
  const lower = text.toLowerCase();
  const result = {};

  for (const [key, aliases] of Object.entries(ALIASES)) {
    // Try each alias from most specific to least specific
    for (const alias of aliases) {
      const idx = lower.indexOf(alias);
      if (idx === -1) continue;

      // Look for the first number within the 120 characters after the alias
      const window = text.slice(idx + alias.length, idx + alias.length + 120);
      const match = window.match(/(\d+\.?\d*)/);
      if (match) {
        const val = parseFloat(match[1]);
        // Basic sanity: reject 0 and unrealistically large values
        if (val > 0 && val < 100000) {
          result[key] = val;
          break;
        }
      }
    }
  }

  return result;
}

export async function extractLabsFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const text = await extractTextFromPdf(arrayBuffer);
  return parseLabValues(text);
}

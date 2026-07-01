// pdfjs-dist is ~400KB and only needed during an actual PDF import, so load it
// on first use — otherwise it gets bundled into the Settings screen and every
// visit to Settings pays for it.
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).href;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// Maps our internal marker keys to the names labs commonly print on reports.
// Listed most-specific → least-specific so the first match wins.
const ALIASES = {
  ldl:          ['ldl cholesterol', 'ldl-c', 'ldl-cholesterol', 'ldl'],
  hdl:          ['hdl cholesterol', 'hdl-c', 'hdl-cholesterol', 'hdl'],
  total_chol:   ['cholesterol, total', 'total cholesterol', 'cholesterol total', 'total chol'],
  trig:         ['triglycerides', 'triglyceride', 'trig'],
  apob:         ['apolipoprotein b', 'apob', 'apo b'],
  lpa:          ['lipoprotein(a)', 'lp(a)', 'lpa'],
  glucose:      ['glucose, fasting', 'fasting glucose', 'blood glucose', 'glucose'],
  hba1c:        ['hemoglobin a1c', 'glycated hemoglobin', 'hba1c', 'a1c'],
  insulin:      ['insulin, fasting', 'fasting insulin', 'insulin'],
  uric_acid:    ['uric acid, serum', 'serum uric acid', 'uric acid'],
  hscrp:        ['c-reactive protein', 'high sensitivity crp', 'hs-crp', 'hscrp', 'crp'],
  homocysteine: ['homocysteine, plasma', 'plasma homocysteine', 'homocysteine'],
  vit_d:        ['25-oh vitamin d', '25(oh)d', '25-hydroxyvitamin d', 'vitamin d, 25', 'vitamin d3', 'vitamin d'],
  b12:          ['vitamin b-12', 'vitamin b12', 'cobalamin', 'b12'],
  magnesium:    ['magnesium, rbc', 'rbc magnesium', 'magnesium'],
  ferritin:     ['ferritin, serum', 'serum ferritin', 'ferritin'],
  omega3:       ['omega-3 index', 'omega 3 index', 'epa+dha', 'omega3'],
  testosterone: ['testosterone, total', 'total testosterone', 'testosterone'],
  dheas:        ['dhea-sulfate', 'dhea-s', 'dheas', 'dehydroepiandrosterone'],
  igf1:         ['igf-1', 'igf1', 'insulin-like growth factor'],
  cortisol:     ['cortisol, am', 'morning cortisol', 'cortisol'],
  alt:          ['alanine aminotransferase', 'alt/sgpt', 'alt'],
  ast:          ['aspartate aminotransferase', 'ast/sgot', 'ast'],
  ggt:          ['gamma-glutamyl transferase', 'ggt', 'ggtp'],
  egfr:         ['estimated gfr', 'egfr', 'gfr'],
  tsh:          ['thyroid stimulating hormone', 'thyrotropin', 'tsh'],
  albumin:      ['albumin, serum', 'serum albumin', 'albumin'],
  creatinine:   ['creatinine, serum', 'serum creatinine', 'creatinine'],
  lymphocyte:   ['lymphocyte %', 'lymphocytes %', 'lymphocyte percent', 'lymphocytes', 'lymphocyte'],
  mcv:          ['mean corpuscular volume', 'mean cell volume', 'mcv'],
  rdw:          ['red cell distribution width', 'rdw-cv', 'rdw-sd', 'rdw'],
  alk_phos:     ['alkaline phosphatase', 'alk phosphatase', 'alk phos', 'alp'],
  wbc:          ['white blood cell count', 'white blood cells', 'leukocyte count', 'wbc'],
};

async function extractTextFromPdf(arrayBuffer) {
  const { getDocument } = await loadPdfjs();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item) => item.str).join(' ') + '\n';
  }
  return fullText;
}

function parseLabValues(text) {
  const lower = text.toLowerCase();
  const result = {};

  for (const [key, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const idx = lower.indexOf(alias);
      if (idx === -1) continue;

      // Grab the first number in the 120 characters following the matched label
      const window = text.slice(idx + alias.length, idx + alias.length + 120);
      const match = window.match(/(\d+\.?\d*)/);
      if (match) {
        const val = parseFloat(match[1]);
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

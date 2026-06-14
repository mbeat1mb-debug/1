// Lab markers for biological age calculation
// No imports needed — only uses localStorage

// ── Levine PhenoAge Formula (Aging 2018) ────────────────────────────────────
// Exact coefficients from Morgan Levine's validated biological age model.
// Returns estimated biological age in years, or null if any required marker is missing.
// Required: albumin (g/dL), creatinine (mg/dL), glucose (mg/dL), crp (mg/L),
//           lymphocyte (%), mcv (fL), rdw (%), alk_phos (U/L), wbc (1000 cells/µL), age (years)
export function calculatePhenoAge({ albumin, creatinine, glucose, crp, lymphocyte, mcv, rdw, alk_phos, wbc, age }) {
  if ([albumin, creatinine, glucose, crp, lymphocyte, mcv, rdw, alk_phos, wbc, age].some(v => v == null || isNaN(v))) return null
  const crpSafe = Math.max(0.01, crp)  // ln(0) undefined; CRP is never truly zero
  const creatinineUmol = creatinine * 88.4  // Levine formula uses µmol/L; marker is entered in mg/dL
  const xb = -19.9067
    - 0.0336  * albumin
    + 0.0095  * creatinineUmol
    + 0.1953  * glucose
    + 0.0954  * Math.log(crpSafe)
    - 0.0120  * lymphocyte
    + 0.0268  * mcv
    + 0.3306  * rdw
    + 0.00188 * alk_phos
    + 0.0554  * wbc
    + 0.0804  * age
  const M = 1 - Math.exp(-Math.exp(xb) * 1.51714 / 0.0076927)
  const phenoAge = 141.50225 + Math.log(-0.00553 * Math.log(1 - M)) / 0.090165
  if (!isFinite(phenoAge)) return null  // guard against extreme lab values overflowing M→1
  return Math.round(phenoAge * 10) / 10
}

// Keys for the 9 PhenoAge required bloodwork markers
const PHENOAGE_KEYS = ['albumin', 'creatinine', 'glucose', 'hscrp', 'lymphocyte', 'mcv', 'rdw', 'alk_phos', 'wbc']

export const LAB_MARKERS = [
  // ── PhenoAge CBC/CMP core markers (listed first for prominence) ─────────
  {
    key: 'albumin',
    label: 'Albumin',
    unit: 'g/dL',
    group: 'PhenoAge Panel',
    ref: 'Normal 3.8–5.0 · Higher is better (protein/liver health)',
    score(v) { return 0 },  // Handled by PhenoAge formula
    grade(v) {
      if (v >= 4.0) return 'Optimal'
      if (v >= 3.5) return 'Normal'
      return 'Low'
    },
    color(v) {
      if (v >= 4.0) return '#00c9a7'
      if (v >= 3.5) return '#f59e0b'
      return '#ef4444'
    },
  },
  {
    key: 'creatinine',
    label: 'Creatinine',
    unit: 'mg/dL',
    group: 'PhenoAge Panel',
    ref: 'Normal 0.7–1.2 men · Lower indicates better kidney function',
    score(v) { return 0 },
    grade(v) {
      if (v <= 1.2) return 'Normal'
      if (v <= 1.5) return 'Mildly Elevated'
      return 'Elevated'
    },
    color(v) {
      if (v <= 1.2) return '#00c9a7'
      if (v <= 1.5) return '#f59e0b'
      return '#ef4444'
    },
  },
  {
    key: 'lymphocyte',
    label: 'Lymphocyte %',
    unit: '%',
    group: 'PhenoAge Panel',
    ref: 'Normal 20–40% · Lower suggests immune aging',
    score(v) { return 0 },
    grade(v) {
      if (v >= 25 && v <= 40) return 'Optimal'
      if (v >= 20) return 'Normal'
      return 'Low'
    },
    color(v) {
      if (v >= 25 && v <= 40) return '#00c9a7'
      if (v >= 20) return '#f59e0b'
      return '#ef4444'
    },
  },
  {
    key: 'mcv',
    label: 'MCV (Red Cell Volume)',
    unit: 'fL',
    group: 'PhenoAge Panel',
    ref: 'Normal 80–96 fL · Elevated = nutritional gaps or aging',
    score(v) { return 0 },
    grade(v) {
      if (v >= 80 && v <= 96) return 'Normal'
      if (v > 96) return 'Elevated'
      return 'Low'
    },
    color(v) {
      if (v >= 80 && v <= 96) return '#00c9a7'
      if (v > 96 || v < 80) return '#f59e0b'
      return '#ef4444'
    },
  },
  {
    key: 'rdw',
    label: 'RDW (Red Cell Width)',
    unit: '%',
    group: 'PhenoAge Panel',
    ref: 'Normal 11.5–14.5% · Higher predicts mortality across diseases',
    score(v) { return 0 },
    grade(v) {
      if (v <= 13) return 'Optimal'
      if (v <= 14.5) return 'Normal'
      return 'Elevated'
    },
    color(v) {
      if (v <= 13) return '#00c9a7'
      if (v <= 14.5) return '#f59e0b'
      return '#ef4444'
    },
  },
  {
    key: 'alk_phos',
    label: 'Alkaline Phosphatase',
    unit: 'U/L',
    group: 'PhenoAge Panel',
    ref: 'Optimal <70 · Elevated suggests liver/bone stress',
    score(v) { return 0 },
    grade(v) {
      if (v < 70) return 'Optimal'
      if (v <= 120) return 'Normal'
      return 'Elevated'
    },
    color(v) {
      if (v < 70) return '#00c9a7'
      if (v <= 120) return '#f59e0b'
      return '#ef4444'
    },
  },
  {
    key: 'wbc',
    label: 'White Blood Cell Count',
    unit: 'K/µL',
    group: 'PhenoAge Panel',
    ref: 'Normal 4.5–9.0 · Chronic elevation signals inflammation',
    score(v) { return 0 },
    grade(v) {
      if (v >= 4.5 && v <= 7.5) return 'Optimal'
      if (v <= 9.0) return 'Normal'
      return 'Elevated'
    },
    color(v) {
      if (v >= 4.5 && v <= 7.5) return '#00c9a7'
      if (v <= 9.0) return '#f59e0b'
      return '#ef4444'
    },
  },


  // ── Lipids ──────────────────────────────────────────────────────────────
  {
    key: 'ldl',
    label: 'LDL Cholesterol',
    unit: 'mg/dL',
    group: 'Lipids',
    ref: 'Optimal <70 · Good <100 · High >130',
    score(v) {
      if (v < 70) return -2;
      if (v < 100) return -1;
      if (v < 130) return 0;
      if (v < 160) return 1;
      if (v < 190) return 2;
      return 4;
    },
    grade(v) {
      if (v < 70) return 'Optimal';
      if (v < 100) return 'Near Optimal';
      if (v < 130) return 'Borderline';
      if (v < 160) return 'High';
      return 'Very High';
    },
    color(v) {
      if (v < 100) return '#00c9a7';
      if (v < 130) return '#f59e0b';
      if (v < 160) return '#f97316';
      return '#ef4444';
    },
  },
  {
    key: 'hdl',
    label: 'HDL Cholesterol',
    unit: 'mg/dL',
    group: 'Lipids',
    ref: 'Excellent >70 · Low <40',
    score(v) {
      if (v > 70) return -2;
      if (v > 60) return -1;
      if (v >= 40) return 0;
      return 2;
    },
    grade(v) {
      if (v > 70) return 'Excellent';
      if (v > 60) return 'Good';
      if (v >= 40) return 'Normal';
      return 'Low';
    },
    color(v) {
      if (v > 60) return '#00c9a7';
      if (v >= 40) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'total_chol',
    label: 'Total Cholesterol',
    unit: 'mg/dL',
    group: 'Lipids',
    ref: 'Desirable <200 · High >240',
    score(v) {
      if (v < 200) return -1;
      if (v < 240) return 1;
      return 2;
    },
    grade(v) {
      if (v < 200) return 'Desirable';
      if (v < 240) return 'Borderline High';
      return 'High';
    },
    color(v) {
      if (v < 200) return '#00c9a7';
      if (v < 240) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'trig',
    label: 'Triglycerides',
    unit: 'mg/dL',
    group: 'Lipids',
    ref: 'Optimal <100 · High >200',
    score(v) {
      if (v < 100) return -1;
      if (v < 150) return 0;
      if (v < 200) return 1;
      if (v < 500) return 2;
      return 4;
    },
    grade(v) {
      if (v < 100) return 'Optimal';
      if (v < 150) return 'Normal';
      if (v < 200) return 'Borderline';
      if (v < 500) return 'High';
      return 'Very High';
    },
    color(v) {
      if (v < 100) return '#00c9a7';
      if (v < 150) return '#3b82f6';
      if (v < 200) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'apob',
    label: 'ApoB',
    unit: 'mg/dL',
    group: 'Lipids',
    ref: 'Optimal <60 · Good <80',
    score(v) {
      if (v < 60) return -2;
      if (v < 80) return -1;
      if (v < 100) return 0;
      if (v < 130) return 1;
      return 3;
    },
    grade(v) {
      if (v < 60) return 'Optimal';
      if (v < 80) return 'Good';
      if (v < 100) return 'Acceptable';
      return 'High';
    },
    color(v) {
      if (v < 80) return '#00c9a7';
      if (v < 100) return '#3b82f6';
      if (v < 130) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'lpa',
    label: 'Lp(a)',
    unit: 'mg/dL',
    group: 'Lipids',
    ref: 'Normal <30 · High Risk >50',
    score(v) {
      if (v < 30) return 0;
      if (v < 50) return 1;
      if (v < 100) return 2;
      return 3;
    },
    grade(v) {
      if (v < 30) return 'Normal';
      if (v < 50) return 'Borderline';
      return 'High Risk';
    },
    color(v) {
      if (v < 30) return '#00c9a7';
      if (v < 50) return '#f59e0b';
      return '#ef4444';
    },
  },

  // ── Metabolic ────────────────────────────────────────────────────────────
  {
    key: 'glucose',
    label: 'Fasting Glucose',
    unit: 'mg/dL',
    group: 'Metabolic',
    ref: 'Optimal <85 · Prediabetes 100–125',
    score(v) {
      if (v < 85) return -1;
      if (v < 100) return 0;
      if (v < 126) return 1;
      return 3;
    },
    grade(v) {
      if (v < 85) return 'Optimal';
      if (v < 100) return 'Normal';
      if (v < 126) return 'Prediabetes';
      return 'Diabetes Range';
    },
    color(v) {
      if (v < 85) return '#00c9a7';
      if (v < 100) return '#3b82f6';
      if (v < 126) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'hba1c',
    label: 'HbA1c',
    unit: '%',
    group: 'Metabolic',
    ref: 'Optimal <5.4 · Prediabetes 5.7–6.4',
    score(v) {
      if (v < 5.4) return -2;
      if (v < 5.7) return -1;
      if (v < 6.5) return 1;
      return 3;
    },
    grade(v) {
      if (v < 5.4) return 'Optimal';
      if (v < 5.7) return 'Normal';
      if (v < 6.5) return 'Prediabetes';
      return 'Diabetes Range';
    },
    color(v) {
      if (v < 5.4) return '#00c9a7';
      if (v < 5.7) return '#3b82f6';
      if (v < 6.5) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'insulin',
    label: 'Fasting Insulin',
    unit: 'µIU/mL',
    group: 'Metabolic',
    ref: 'Optimal <6 · Elevated >20',
    score(v) {
      if (v < 6) return -2;
      if (v < 10) return -1;
      if (v < 20) return 1;
      return 3;
    },
    grade(v) {
      if (v < 6) return 'Optimal';
      if (v < 10) return 'Good';
      if (v < 20) return 'Elevated';
      return 'High';
    },
    color(v) {
      if (v < 6) return '#00c9a7';
      if (v < 10) return '#3b82f6';
      if (v < 20) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'uric_acid',
    label: 'Uric Acid',
    unit: 'mg/dL',
    group: 'Metabolic',
    ref: 'Optimal <5.5 · Elevated >7',
    score(v) {
      if (v < 5.5) return -1;
      if (v < 7) return 0;
      if (v < 9) return 1;
      return 2;
    },
    grade(v) {
      if (v < 5.5) return 'Optimal';
      if (v < 7) return 'Normal';
      if (v < 9) return 'Elevated';
      return 'High';
    },
    color(v) {
      if (v < 5.5) return '#00c9a7';
      if (v < 7) return '#3b82f6';
      return '#ef4444';
    },
  },

  // ── Inflammation ─────────────────────────────────────────────────────────
  {
    key: 'hscrp',
    label: 'hs-CRP',
    unit: 'mg/L',
    group: 'Inflammation',
    ref: 'Optimal <0.5 · High Risk >3',
    score(v) {
      if (v < 0.5) return -2;
      if (v < 1) return -1;
      if (v < 3) return 1;
      if (v < 10) return 3;
      return 1; // >10 often acute, not chronic
    },
    grade(v) {
      if (v < 0.5) return 'Optimal';
      if (v < 1) return 'Low Risk';
      if (v < 3) return 'Moderate Risk';
      if (v < 10) return 'High Risk';
      return 'Very High';
    },
    color(v) {
      if (v < 0.5) return '#00c9a7';
      if (v < 1) return '#3b82f6';
      if (v < 3) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'homocysteine',
    label: 'Homocysteine',
    unit: 'µmol/L',
    group: 'Inflammation',
    ref: 'Optimal <8 · High >15',
    score(v) {
      if (v < 8) return -1;
      if (v < 12) return 0;
      if (v < 15) return 1;
      return 3;
    },
    grade(v) {
      if (v < 8) return 'Optimal';
      if (v < 12) return 'Normal';
      if (v < 15) return 'Elevated';
      return 'High';
    },
    color(v) {
      if (v < 8) return '#00c9a7';
      if (v < 12) return '#3b82f6';
      if (v < 15) return '#f59e0b';
      return '#ef4444';
    },
  },

  // ── Vitamins & Minerals ──────────────────────────────────────────────────
  {
    key: 'vit_d',
    label: 'Vitamin D (25-OH)',
    unit: 'ng/mL',
    group: 'Vitamins & Minerals',
    ref: 'Optimal >50 · Deficient <20',
    score(v) {
      if (v > 60) return -2;
      if (v > 50) return -1;
      if (v >= 30) return 0;
      if (v >= 20) return 1;
      return 2;
    },
    grade(v) {
      if (v > 50) return 'Optimal';
      if (v >= 30) return 'Adequate';
      if (v >= 20) return 'Insufficient';
      return 'Deficient';
    },
    color(v) {
      if (v > 50) return '#00c9a7';
      if (v >= 30) return '#3b82f6';
      if (v >= 20) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'b12',
    label: 'Vitamin B12',
    unit: 'pg/mL',
    group: 'Vitamins & Minerals',
    ref: 'Optimal >400 · Deficient <200',
    score(v) {
      if (v >= 400) return -1;
      if (v >= 200) return 0;
      return 2;
    },
    grade(v) {
      if (v >= 400) return 'Optimal';
      if (v >= 200) return 'Low-Normal';
      return 'Deficient';
    },
    color(v) {
      if (v >= 400) return '#00c9a7';
      if (v >= 200) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'magnesium',
    label: 'Magnesium (RBC)',
    unit: 'mg/dL',
    group: 'Vitamins & Minerals',
    ref: 'Optimal 2.0–2.5',
    score(v) {
      if (v >= 2.0 && v <= 2.5) return -1;
      if (v >= 1.7) return 0;
      return 1;
    },
    grade(v) {
      if (v >= 2.0 && v <= 2.5) return 'Optimal';
      if (v >= 1.7) return 'Low-Normal';
      return 'Low';
    },
    color(v) {
      if (v >= 2.0 && v <= 2.5) return '#00c9a7';
      if (v >= 1.7) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'ferritin',
    label: 'Ferritin',
    unit: 'ng/mL',
    group: 'Vitamins & Minerals',
    ref: 'Normal 30–200 men / 15–150 women',
    score(v) {
      if (v < 15) return 1;
      if (v > 300) return 2;
      if (v > 200) return 1;
      return 0;
    },
    grade(v) {
      if (v < 15) return 'Low (Iron Deficiency)';
      if (v > 300) return 'Very High';
      if (v > 200) return 'Elevated';
      return 'Normal';
    },
    color(v) {
      if (v < 15 || v > 300) return '#ef4444';
      if (v > 200) return '#f59e0b';
      return '#00c9a7';
    },
  },
  {
    key: 'omega3',
    label: 'Omega-3 Index',
    unit: '%',
    group: 'Vitamins & Minerals',
    ref: 'Optimal >8 · High Risk <4',
    score(v) {
      if (v > 8) return -2;
      if (v >= 5) return -1;
      if (v >= 4) return 1;
      return 2;
    },
    grade(v) {
      if (v > 8) return 'Optimal';
      if (v >= 5) return 'Acceptable';
      if (v >= 4) return 'Low';
      return 'High Risk';
    },
    color(v) {
      if (v > 8) return '#00c9a7';
      if (v >= 5) return '#3b82f6';
      if (v >= 4) return '#f59e0b';
      return '#ef4444';
    },
  },

  // ── Hormones ─────────────────────────────────────────────────────────────
  {
    key: 'testosterone',
    label: 'Testosterone (Total)',
    unit: 'ng/dL',
    group: 'Hormones',
    ref: 'Men: Optimal >700 · Low <300',
    score(v) {
      if (v > 700) return -1;
      if (v >= 400) return 0;
      if (v >= 300) return 1;
      return 2;
    },
    grade(v) {
      if (v > 700) return 'Optimal';
      if (v >= 400) return 'Normal';
      if (v >= 300) return 'Low-Normal';
      return 'Low';
    },
    color(v) {
      if (v > 700) return '#00c9a7';
      if (v >= 400) return '#3b82f6';
      if (v >= 300) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'dheas',
    label: 'DHEA-S',
    unit: 'µg/dL',
    group: 'Hormones',
    ref: 'Declines with age — higher = younger',
    score(v) {
      if (v > 250) return -2;
      if (v > 150) return -1;
      if (v > 80) return 0;
      return 1;
    },
    grade(v) {
      if (v > 250) return 'Excellent';
      if (v > 150) return 'Good';
      if (v > 80) return 'Low-Normal';
      return 'Low';
    },
    color(v) {
      if (v > 250) return '#00c9a7';
      if (v > 150) return '#3b82f6';
      if (v > 80) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'igf1',
    label: 'IGF-1',
    unit: 'ng/mL',
    group: 'Hormones',
    ref: 'Optimal 100–250. Too high or low both risk mortality.',
    score(v) {
      if (v >= 100 && v <= 250) return -1;
      if (v >= 75) return 0;
      return 1;
    },
    grade(v) {
      if (v >= 100 && v <= 250) return 'Optimal';
      if (v > 250) return 'High';
      if (v >= 75) return 'Low-Normal';
      return 'Low';
    },
    color(v) {
      if (v >= 100 && v <= 250) return '#00c9a7';
      if (v >= 75) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'cortisol',
    label: 'Cortisol (AM)',
    unit: 'µg/dL',
    group: 'Hormones',
    ref: 'Normal 6–23 · Optimal 6–15',
    score(v) {
      if (v >= 6 && v <= 15) return -1;
      if (v <= 23) return 0;
      return 2;
    },
    grade(v) {
      if (v >= 6 && v <= 15) return 'Optimal';
      if (v <= 23) return 'Normal';
      return 'Elevated';
    },
    color(v) {
      if (v >= 6 && v <= 15) return '#00c9a7';
      if (v <= 23) return '#3b82f6';
      return '#ef4444';
    },
  },

  // ── Organ Function ───────────────────────────────────────────────────────
  {
    key: 'alt',
    label: 'ALT (Liver)',
    unit: 'U/L',
    group: 'Organ Function',
    ref: 'Optimal <20 · Elevated >55',
    score(v) {
      if (v < 20) return -1;
      if (v < 35) return 0;
      if (v < 55) return 1;
      return 2;
    },
    grade(v) {
      if (v < 20) return 'Optimal';
      if (v < 35) return 'Normal';
      if (v < 55) return 'Mild Elevation';
      return 'Elevated';
    },
    color(v) {
      if (v < 20) return '#00c9a7';
      if (v < 35) return '#3b82f6';
      if (v < 55) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'ast',
    label: 'AST (Liver)',
    unit: 'U/L',
    group: 'Organ Function',
    ref: 'Optimal <20 · Elevated >40',
    score(v) {
      if (v < 20) return -1;
      if (v < 35) return 0;
      if (v < 55) return 1;
      return 2;
    },
    grade(v) {
      if (v < 20) return 'Optimal';
      if (v < 35) return 'Normal';
      if (v < 55) return 'Mild Elevation';
      return 'Elevated';
    },
    color(v) {
      if (v < 20) return '#00c9a7';
      if (v < 35) return '#3b82f6';
      if (v < 55) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'ggt',
    label: 'GGT',
    unit: 'U/L',
    group: 'Organ Function',
    ref: 'Optimal <20 · Elevated by alcohol/liver stress',
    score(v) {
      if (v < 20) return -1;
      if (v < 40) return 0;
      if (v < 80) return 1;
      return 2;
    },
    grade(v) {
      if (v < 20) return 'Optimal';
      if (v < 40) return 'Normal';
      if (v < 80) return 'Elevated';
      return 'High';
    },
    color(v) {
      if (v < 20) return '#00c9a7';
      if (v < 40) return '#3b82f6';
      if (v < 80) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'egfr',
    label: 'eGFR (Kidney)',
    unit: 'mL/min',
    group: 'Organ Function',
    ref: 'Normal >90 · CKD <60',
    score(v) {
      if (v > 90) return -1;
      if (v >= 60) return 0;
      if (v >= 45) return 2;
      if (v >= 30) return 4;
      return 6;
    },
    grade(v) {
      if (v > 90) return 'Normal';
      if (v >= 60) return 'Mildly Reduced';
      if (v >= 45) return 'Moderate CKD';
      return 'Severe CKD';
    },
    color(v) {
      if (v > 90) return '#00c9a7';
      if (v >= 60) return '#3b82f6';
      if (v >= 45) return '#f59e0b';
      return '#ef4444';
    },
  },
  {
    key: 'tsh',
    label: 'TSH (Thyroid)',
    unit: 'mIU/L',
    group: 'Organ Function',
    ref: 'Optimal 0.5–2.5 · Abnormal <0.4 or >4.5',
    score(v) {
      if (v >= 0.5 && v <= 2.5) return -1;
      if (v >= 0.4 && v <= 4.5) return 0;
      return 1;
    },
    grade(v) {
      if (v >= 0.5 && v <= 2.5) return 'Optimal';
      if (v >= 0.4 && v <= 4.5) return 'Normal';
      if (v < 0.4) return 'Low (Hyperthyroid?)';
      return 'High (Hypothyroid?)';
    },
    color(v) {
      if (v >= 0.5 && v <= 2.5) return '#00c9a7';
      if (v >= 0.4 && v <= 4.5) return '#3b82f6';
      return '#f59e0b';
    },
  },
];

/**
 * Read saved lab results from localStorage.
 * Returns an object keyed by marker key, each value: { value, date }
 */
export function getLabResults() {
  try {
    const raw = localStorage.getItem('lab_results');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Persist lab results to localStorage.
 * @param {Record<string, { value: number, date: string }>} results
 */
export function saveLabResults(results) {
  localStorage.setItem('lab_results', JSON.stringify(results));
}

/**
 * Returns a year adjustment for the biological age calculation.
 * When all 9 Levine PhenoAge markers are present, uses the validated clinical
 * formula and returns (PhenoAge - chronologicalAge). Otherwise falls back to
 * additive marker scoring. Clamped to ±8 years before returning.
 */
export function getLabAgeAdjustment() {
  const results = getLabResults();
  const val = key => { const e = results[key]; if (!e || e.value == null || e.value === '') return null; const v = parseFloat(e.value); return isNaN(v) ? null : v }

  const albumin    = val('albumin')
  const creatinine = val('creatinine')
  const glucose    = val('glucose')
  const crp        = val('hscrp')
  const lymphocyte = val('lymphocyte')
  const mcv        = val('mcv')
  const rdw        = val('rdw')
  const alk_phos   = val('alk_phos')
  const wbc        = val('wbc')

  if ([albumin, creatinine, glucose, crp, lymphocyte, mcv, rdw, alk_phos, wbc].every(v => v !== null)) {
    try {
      const age = (() => { try { const a = parseInt(localStorage.getItem('user_age'), 10); return isNaN(a) ? 39 : a } catch { return 39 } })()
      const phenoAge = calculatePhenoAge({ albumin, creatinine, glucose, crp, lymphocyte, mcv, rdw, alk_phos, wbc, age })
      if (phenoAge !== null) return Math.round(Math.max(-8, Math.min(8, phenoAge - age)))
    } catch {}
  }

  // Fallback: additive scoring for whatever markers are entered
  // PhenoAge panel markers (albumin, creatinine, etc.) score 0 since they're only
  // meaningful as a complete set — don't let partial panels distort the result.
  let total = 0;
  for (const marker of LAB_MARKERS) {
    const v = val(marker.key)
    if (v !== null) total += marker.score(v)
  }
  return total;
}

/**
 * Returns PhenoAge if all 9 required markers are entered, else null.
 */
export function getPhenoAgeResult() {
  const results = getLabResults();
  const val = key => { const e = results[key]; if (!e || e.value == null) return null; const v = parseFloat(e.value); return isNaN(v) ? null : v }
  const markers = { albumin: val('albumin'), creatinine: val('creatinine'), glucose: val('glucose'), crp: val('hscrp'), lymphocyte: val('lymphocyte'), mcv: val('mcv'), rdw: val('rdw'), alk_phos: val('alk_phos'), wbc: val('wbc') }
  if (Object.values(markers).some(v => v === null)) return null
  try {
    const age = (() => { try { const a = parseInt(localStorage.getItem('user_age'), 10); return isNaN(a) ? 39 : a } catch { return 39 } })()
    return calculatePhenoAge({ ...markers, age })
  } catch { return null }
}

/**
 * Returns an array of contribution objects for all entered markers.
 * Each item: { label, value, unit, contribution, sublabel, color }
 *   - contribution: the integer score for this marker
 *   - sublabel: grade + ' · ' + date
 *   - unit: marker unit with a leading space, e.g. ' mg/dL'
 */
export function getLabContributions() {
  const results = getLabResults();
  const contributions = [];
  for (const marker of LAB_MARKERS) {
    const entry = results[marker.key];
    if (entry != null && entry.value != null && entry.value !== '') {
      const v = parseFloat(entry.value);
      if (!isNaN(v)) {
        contributions.push({
          label: marker.label,
          value: v,
          unit: ' ' + marker.unit,
          contribution: marker.score(v),
          sublabel: marker.grade(v) + (entry.date ? ' · ' + entry.date : ''),
          color: marker.color(v),
        });
      }
    }
  }
  return contributions;
}

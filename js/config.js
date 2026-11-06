/*
 * SITE SETTINGS
 * This is the only file you should need to edit. Everything else on the site
 * is generated from the CSV named in `dataFile`.
 */
window.SITE_CONFIG = {
  // The CSV the site reads. Replace this file to update the whole site.
  dataFile: 'data/papers.csv',

  /* ---------- Wording ---------- */
  siteTitle: 'Full-Spectrum OOD detection',
  volume: 'Vol. 01 / Literature review',
  filedUnder: 'Filed under Full-Spectrum OOD detection',
  footerWord: 'Full-Spectrum OOD detection',

  // The homepage headline: before + emphasis word + after.
  hero: {
    before: 'Full-Spectrum',
    emphasis: 'OOD',
    after: ' detection',
    lead: 'A literature review of full-spectrum out-of-distribution (OOD) detection. Consult the papers, the methods they use, the statistics across the field, and the code and datasets you can reuse.',
  },

  // The About page. Anything left empty is hidden from the site.
  review: {
    about: [
      'This site presents the data extracted during a literature review of full-spectrum out-of-distribution (OOD) detection. Each paper was read and coded against a set of research questions, and every number on this site is counted directly from that data.',
    ],
    citation: '', // How readers should cite the review, e.g. 'Author (2026). Title. Journal.'
    authors: '', // e.g. 'Reviewed by Ana Silva and Rui Costa'
    contact: '', // An email address or URL
  },

  /* ---------- Reading the CSV ---------- */

  // Cells containing one of these count as empty and show as "Not reported".
  missingValues: ['', 'na', 'n/a', 'nan', 'null', '-', '--', '—', 'not reported', 'nr'],

  // A first word from this list means "yes" when working out whether code or data is open.
  affirmativeWords: ['yes', 'y', 'true', '1', 'si', 'sim', 'open', 'available'],

  /*
   * How each CSV column is used.
   *   column: the header in your CSV. Capitals, spaces and punctuation are ignored
   *           when matching. If you rename a header, change it here.
   *   label:  the name shown on the site.
   *   split:  the characters that separate several values in one cell.
   *
   * Columns not listed here still appear on each paper's record under "Other details".
   */
  fields: {
    id: { column: 'ID', label: 'ID' },
    title: { column: 'Title', label: 'Title' },
    authors: { column: 'Authors', label: 'Authors', split: ';' },
    year: { column: 'Year', label: 'Year' },
    venue: { column: 'Publication Title', label: 'Publication', split: '' },
    citations: { column: 'Citation Count', label: 'Citations' },
    references: { column: 'Refrencias', label: 'References' },
    doi: { column: 'DOI', label: 'DOI' },
    link: { column: 'Link', label: 'Link' },
    abstract: { column: 'Abstract', label: 'Abstract' },
    keywords: { column: 'Keywords', label: 'Keywords', split: ';,' },
    type: { column: 'Type', label: 'Publication type' },
    conference: { column: 'Conference Name', label: 'Conference' },
    country: { column: 'Country', label: 'Country', split: ';,' },
    institution: { column: 'Institution_STD', label: 'Institution', split: ';' },
    purposeText: { column: 'RQ1: What is the purpose?', label: 'Purpose, in detail' },
    purpose: { column: 'RQ1.Option', label: 'Purpose', split: ';' },
    methods: { column: 'RQ2 :What methods are used?', label: 'Methods used', split: ';' },
    category: { column: 'RQ2: Categorization', label: 'Method category', split: ';' },
    category2: { column: 'RQ2:CATEGORIZATION2', label: 'Detection Stage Dimension', split: ';' },
    secondDimension: { column: 'RQ2: Second Dimension', label: 'Methodological Objective Dimension', split: ';,' },
    oodRange: { column: 'Near OOD vs Far OOD?', label: 'Near vs far OOD', split: ';' },
    compares: { column: 'compare with other OOD methods?', label: 'Compared with other OOD methods', split: ';' },
    tasks: { column: 'What methods are used for classification, segmentation...?', label: 'Models used for training', split: ';' },
    id: { column: 'ID', label: 'ID dataset', split: ';' },
    covariate: { column: 'COVARIATE SHIFT', label: 'Covariate shift dataset', split: ';' },
    semantic: { column: 'SEMANTIC SHIFT', label: 'Semantic shift dataset', split: ';' },
    metrics: { column: 'RQ7: Metrics', label: 'Metrics', split: ';,' },
    applications: { column: 'RQ8: Applications', label: 'Applications', split: ';,' },
    code: { column: 'RQ9: Open-source implementations', label: 'Open-source implementation', split: ';' },
    codeLink: { column: 'Link to github', label: 'Code links' },
    datasetsOpen: { column: 'RQ9.2: Are the datasets used open-source?', label: 'Open datasets', split: ';' },
    datasetLink: { column: 'Link to dataset', label: 'Dataset links' },
  },

  /* ---------- What appears where (remove a name to hide it) ---------- */

  // Filters on the Papers page, in order.
  facets: ['purpose', 'year', 'type', 'category2', 'secondDimension', 'oodRange', 'compares', 'metrics', 'applications', 'country', 'institution', 'venue', 'code', 'datasetsOpen'],
  facetsOpenByDefault: ['purpose', 'year'],

  // The charts on the Overview page.
  overviewCharts: ['purpose', 'category2', 'secondDimension', 'metrics', 'applications'],

  // Statistics page sections.
  statistics: [
    { meta: 'Publications', before: 'Where the work is', emphasis: 'published', after: '', charts: ['type', 'venue', 'conference'] },
    { meta: 'Approach', before: 'What the', emphasis: 'methods', after: ' set out to do', charts: ['purpose', 'category', 'category2', 'tasks'] },
    { meta: 'Evaluation', before: 'How the', emphasis: 'evidence', after: ' is gathered', charts: ['oodRange', 'covariate', 'semantic', 'compares', 'metrics'] },
    { meta: 'Use', before: 'Where the', emphasis: 'applications', after: ' are', charts: ['applications', 'keywords'] },
    { meta: 'Geography', before: 'Who is doing the', emphasis: 'research', after: '', charts: ['country', 'institution'] },
  ],

  // Shown on each method category on the Methods page.
  methodProfile: ['purpose', 'category2', 'secondDimension', 'oodRange', 'metrics', 'applications'],

  // What method categories can be compared against on the Methods page.
  crosstabDimensions: ['oodRange', 'purpose', 'metrics', 'applications','category2', 'code'],

  // The questions listed on the About page.
  questions: [
    { label: 'RQ1', question: 'What is the purpose?', key: 'purpose' },
    { label: 'RQ2', question: 'What methods are used?', key: 'category' },
    { label: '', question: 'Near OOD vs far OOD?', key: 'oodRange' },
    { label: '', question: 'Compared with other OOD methods?', key: 'compares' },
    { label: '', question: 'What methods are used for classification, segmentation and other tasks?', key: 'tasks' },
    { label: '', question: 'Is covariate shift addressed?', key: 'covariate' },
    { label: '', question: 'Is semantic shift addressed?', key: 'semantic' },
    { label: 'RQ7', question: 'Which metrics are used?', key: 'metrics' },
    { label: 'RQ8', question: 'Which applications are targeted?', key: 'applications' },
    { label: 'RQ9', question: 'Are there open-source implementations?', key: 'code' },
    { label: 'RQ9.2', question: 'Are the datasets used open-source?', key: 'datasetsOpen' },
  ],
};

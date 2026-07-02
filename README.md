# Towards Full-Spectrum Out-of-Distribution: Data Repository

This repository contains the extracted tables and supporting CSV files used in the **Systematic Literature Review (SLR)** project.

The goal of this repository is to provide:
- Traceability between source database records and the final selected studies
- Transparency of the study selection and extraction process
- Reproducibility of the SLR workflow

---

# Repository Structure

```text
.
├── README.md
├── index.html
├── script.js
├── style.css
├── othertables/
    ├── ACM.csv
    ├── IEEE.csv
    ├── SCOPUS.csv
    ├── SPRINGER.csv
    ├── WOS.csv
    └── QAAnalysis.csv
```
# Dataset Description

## 1. Source Database Tables

The `othertables/` directory contains the original CSV exports collected from the academic databases used during the SLR process.

### Included Databases

| File | Description |
| --- | --- |
| `ACM.csv` | Records exported from ACM Digital Library |
| `IEEE.csv` | Records exported from IEEE Xplore |
| `SCOPUS.csv` | Records exported from Scopus |
| `SPRINGER.csv` | Records exported from Springer |
| `WOS.csv` | Records exported from Web of Science |

These tables preserve the original metadata retrieved from each source database.

Visualization of the table of selected studies: https://ainat9.github.io/FS-OOD-SLR/ 

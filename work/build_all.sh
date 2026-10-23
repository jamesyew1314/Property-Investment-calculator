#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PY="/Users/huangminming/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3"
NODE="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node"
CLI="/Applications/DeepSeek Harness.app/Contents/Resources/app.asar.unpacked/dsh/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js"

echo "[1/7] diagrams"
"$PY" work/make_arch2.py
"$PY" work/make_erd.py

echo "[2/7] docx"
"$PY" work/build_docx.py

echo "[3/7] pdf"
rm -f work/full.pdf
"$NODE" "$CLI" convert --input work/full.docx --output work/full.pdf

echo "[4/7] markdown"
"$PY" work/build_md.py

echo "[5/7] xlsx"
"$PY" work/build_xlsx.py

echo "[6/7] recalc xlsx"
rm -f work/validation_calc.xlsx
"$NODE" "$CLI" recalculate --input work/validation.xlsx --output work/validation_calc.xlsx

echo "[7/7] copy deliverables"
mkdir -p deliverables
cp work/full.docx "deliverables/房地产投资分析系统_需求分析与开发方案_v1.1.docx"
cp work/full.pdf "deliverables/房地产投资分析系统_需求分析与开发方案_v1.1.pdf"
cp work/validation_calc.xlsx "deliverables/投资系统_公式验证与案例对账_v1.1.xlsx"
rm -f "deliverables/房地产投资分析系统_需求分析与开发方案_v1.0.docx" \
      "deliverables/房地产投资分析系统_需求分析与开发方案_v1.0.pdf" \
      "deliverables/房地产投资分析系统_需求分析与开发方案_v1.0.md" \
      "deliverables/投资系统_公式验证与案例对账_v1.0.xlsx"
echo "done: deliverables/"

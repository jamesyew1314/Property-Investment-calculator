"""Markdown renderer with the same API as doc_lib (for generating the .md edition)."""
from __future__ import annotations
import os, shutil, re

# dummy units / colors used by the section modules
def Pt(x): return x
def Cm(x): return x
def RGBColor(*a, **k): return "color"
NAVY="navy"; BLUE="blue"; GREEN="green"; RED="red"; GREY="grey"; DARK="dark"; LIGHTGREY="lightgrey"; WHITE="white"
MONO="Menlo"; EA_FONT="PingFang SC"; LATIN_FONT="Calibri"

class Run:
    def __init__(self, text=""):
        self.text=str(text); self.bold=False; self.italic=False; self.size=None; self.color=None

class PF:
    def __init__(self):
        self.space_after=None; self.space_before=None; self.line_spacing=None
        self.left_indent=None; self.keep_with_next=None

class P:
    def __init__(self, style=None):
        self.runs=[]; self.style=style or ""; self.paragraph_format=PF(); self.alignment=None
    def add_run(self, text=""):
        r=Run(text); self.runs.append(r); return r

class Doc:
    def __init__(self, out_dir):
        self.blocks=[]; self.out_dir=out_dir; self.assets=os.path.join(out_dir,"assets")
        os.makedirs(self.assets, exist_ok=True)
    def add_paragraph(self, style=None):
        p=P(style); self.blocks.append(("p",p)); return p
    def add_page_break(self):
        pass
    def add_picture(self, path, width=None):
        base=os.path.basename(path)
        dest=os.path.join(self.assets, base)
        if os.path.abspath(path)!=os.path.abspath(dest):
            shutil.copyfile(path, dest)
        self.blocks.append(("img", base))
    def add_table(self, *a, **k):
        raise RuntimeError("sections should use table()")

def setup_doc(out_dir="."):
    return Doc(out_dir)

def run_font(run, size=10.5, bold=False, color=DARK, italic=False, ea=EA_FONT, latin=LATIN_FONT):
    run.size=size; run.bold=bold; run.italic=italic; run.color=color

def _runs_md(p):
    out=[]
    for r in p.runs:
        t=r.text
        if not t: continue
        if r.bold and t.strip():
            # avoid nesting markers around whitespace
            lead = " " if t[:1].isspace() else ""
            trail = " " if t[-1:].isspace() else ""
            core=t.strip()
            t=f"{lead}**{core}**{trail}"
        if r.italic and t.strip():
            core=t.strip(); t=f"*{core}*"
        out.append(t)
    return "".join(out)

def _flush_para(p):
    text=_runs_md(p).strip()
    if not text: return None
    if "List Bullet" in p.style:
        return "- "+text
    if "List Number" in p.style:
        return "1. "+text
    return text

def para(doc, text="", size=10.5, bold=False, color=DARK, align=None, space_after=6,
         space_before=0, line=1.25, indent_cm=0, italic=False, keep_next=False):
    p=doc.add_paragraph(); r=p.add_run(text); run_font(r,size=size,bold=bold,color=color,italic=italic)
    return p

def rich_para(doc, parts, size=10.5, space_after=6, line=1.25, align=None, indent_cm=0):
    p=doc.add_paragraph()
    for text,bold,color in parts:
        r=p.add_run(text); run_font(r,size=size,bold=bold,color=color)
    return p

def bullet(doc, text, level=0, size=10.5, color=DARK, bold_lead=None):
    p=doc.add_paragraph(style='List Bullet')
    if bold_lead:
        r=p.add_run(bold_lead); run_font(r,size=size,bold=True,color=NAVY)
    r=p.add_run(text); run_font(r,size=size,color=color)
    return p

def numbered(doc, text, size=10.5, bold_lead=None):
    p=doc.add_paragraph(style='List Number')
    if bold_lead:
        r=p.add_run(bold_lead); run_font(r,size=size,bold=True,color=NAVY)
    r=p.add_run(text); run_font(r,size=size)
    return p

def h1(doc, number, title, subtitle=None):
    doc.blocks.append(("h1", f"# {number} {title}"))
    if subtitle:
        doc.blocks.append(("p", f"*{subtitle}*"))

def h2(doc, number, title):
    doc.blocks.append(("h2", f"## {number} {title}"))

def h3(doc, title):
    doc.blocks.append(("h3", f"### {title}"))

def caption(doc, text):
    t=str(text).replace("*","\\*")
    doc.blocks.append(("caption", f"*{t}*"))

def _cell(v):
    s=str(v).replace("|","\\|").replace("\n","<br>").replace("*","\\*")
    return s

def table(doc, headers, rows, widths, font_size=8.8, header_size=8.8,
          align=None, caption_text=None, zebra=True, first_col_bold=False,
          header_fill="1F3864", highlight_rows=None, keep_rows=True):
    for r in rows:
        if len(r)!=len(headers):
            raise ValueError(f"table row/header mismatch: {len(headers)} headers, {len(r)} cells: {r}")
    if caption_text:
        doc.blocks.append(("caption", f"**{caption_text}**"))
    lines=[]
    lines.append("| "+" | ".join(_cell(h) for h in headers)+" |")
    sep=[]
    for i in range(len(headers)):
        a = align[i] if align and i<len(align) else 'l'
        sep.append("---:" if a=='r' else ":---:" if a=='c' else ":---")
    lines.append("| "+" | ".join(sep)+" |")
    for row in rows:
        lines.append("| "+" | ".join(_cell(x) for x in row)+" |")
    doc.blocks.append(("table", "\n".join(lines)))

CALLOUT_MAP={"info":"NOTE","warn":"WARNING","risk":"CAUTION","ok":"TIP"}
def callout(doc, title, body, kind="info"):
    label=CALLOUT_MAP.get(kind,"NOTE")
    lines=[f"> [!{label}]", f"> **{title}**", ">"]
    for line in str(body).split("\n"):
        lines.append("> "+line)
    doc.blocks.append(("callout","\n".join(lines)))

def code_block(doc, text, size=8.2):
    fence="```"
    if "```" in text: fence="````"
    doc.blocks.append(("code", f"{fence}text\n{text}\n{fence}"))

def cover(doc, title, subtitle, meta_lines):
    doc.blocks.append(("h1", f"# {title}"))
    doc.blocks.append(("p", f"### {subtitle}"))
    lines=["| 项目 | 内容 |","| :--- | :--- |"]
    for k,v in meta_lines:
        lines.append(f"| {_cell(k)} | {_cell(v)} |")
    doc.blocks.append(("table","\n".join(lines)))

def add_header(section, text): pass
def add_page_number_footer(section, left_text): pass
def _separate(doc): pass
def set_cell_shading(*a,**k): pass
def set_cell_margins(*a,**k): pass
def set_table_borders(*a,**k): pass
def set_repeat_header(*a,**k): pass
def set_cant_split(*a,**k): pass
def set_col_widths(*a,**k): pass

def render(doc):
    # first pass: flush paragraphs in order; merge consecutive list items with blank lines
    out=[]
    prev_type=None
    for kind,val in doc.blocks:
        if kind=="p":
            if isinstance(val,str):
                out.append(val); continue
            text=_flush_para(val)
            if not text: continue
            # metadata table etc.
            out.append(text)
        elif kind=="img":
            out.append(f"![{val}](assets/{val})")
        else:
            out.append(val)
    # join: headings need blank lines; tables/code need blank lines
    md=[]
    for i,b in enumerate(out):
        if i>0:
            # no blank line between consecutive list items
            if b.startswith("- ") and out[i-1].startswith("- "):
                md.append("\n")
            else:
                md.append("\n\n")
        md.append(b)
    return "".join(md)

def save(doc, path):
    text=render(doc)
    text=re.sub(r"\n{4,}","\n\n\n",text)
    with open(path,"w",encoding="utf-8") as f:
        f.write(text.rstrip()+"\n")

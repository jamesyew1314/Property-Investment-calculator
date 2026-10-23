import sys, os
sys.path.insert(0,"work")
import md_lib
# make section modules import md_lib when they do `from doc_lib import *`
sys.modules["doc_lib"]=md_lib
import sec0,sec1,sec2,sec3,sec4,sec5,sec6,sec7

out_dir="deliverables"
doc=md_lib.setup_doc(out_dir)
for m in (sec0,sec1,sec2,sec3,sec4,sec5,sec6,sec7):
    m.build(doc)
md_lib.save(doc, os.path.join(out_dir,"房地产投资分析系统_需求分析与开发方案_v1.1.md"))
print("saved", len(doc.blocks), "blocks")

import sys
sys.path.insert(0, "work")
import doc_lib, sec0, sec1, sec2, sec3, sec4, sec5, sec6, sec7

doc = doc_lib.setup_doc()
for m in (sec0, sec1, sec2, sec3, sec4, sec5, sec6, sec7):
    m.build(doc)
doc.save("work/full.docx")
print("saved work/full.docx")

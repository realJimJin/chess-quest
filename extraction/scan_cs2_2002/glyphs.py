import sys, pickle, pymupdf, cv2, numpy as np
from csx import boards as B, textocr as T
p,out=sys.argv[1:]
d=pymupdf.open(p)
gl=[]; m=T.GlyphModel()
for i in range(210,260):
    g=B.render_page(d[i],300)
    gs=T.page_glyphs(g,i)
    m.fit(gs)
    print(i+1,"lines",len({x.line for x in gs}),"glyphs",len(gs),"clusters",len(m.count), flush=True)
    gl+=gs
order=m.order(); cnt=np.array([m.count[i] for i in order]); cum=np.cumsum(cnt)/cnt.sum()
print("glyphs",len(gl),"clusters",len(order),"cover: top100 %.3f top200 %.3f top400 %.3f top800 %.3f"%tuple(cum[min(k,len(cum)-1)] for k in (99,199,399,799)))
m._buf=None
pickle.dump((gl,m),open(out+"/glyphs.pkl","wb"))
cv2.imwrite(out+"/sheet0.png", m.contact_sheet(order[:200]))

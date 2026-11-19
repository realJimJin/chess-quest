import sys,json,pickle,os,pymupdf,cv2,numpy as np
from csx import boards as B, textocr as T
pdf,out=sys.argv[1:3]
gl,gm=pickle.load(open(out+"/glyphs.pkl","rb")); gm.load_labels(out+"/glyph_labels.json")
T.H,T.W=48,66
d=pymupdf.open(pdf)
vecs=[]; imgs=[]; wid=[]
k=0
for i in range(210,260):
    gs=T.page_glyphs(B.render_page(d[i],300),i)
    for g in gs:
        o=gl[k]; assert (o.page,o.line,o.x0)==(g.page,g.line,g.x0),(k,o.page,o.line,o.x0,g.x0)
        vecs.append(g.vec); imgs.append(g.img); wid.append(g.x1-g.x0); k+=1
assert k==len(gl)
V=np.stack(vecs); wid=np.array(wid); del vecs
# templates: the leader glyph of every labelled cluster (that is the image I labelled)
leader={}
for idx,g in enumerate(gl):
    if g.cluster not in leader: leader[g.cluster]=idx
extra=json.load(open(out+"/glyph_extra.json")) if os.path.exists(out+"/glyph_extra.json") else {}
tidx=[]; tlab=[]
for c,lab in gm.labels.items():
    tidx.append(leader[c]); tlab.append(lab)
for idx,lab in extra.items():
    tidx.append(int(idx)); tlab.append(lab)
def shifted(img,dy):
    m=np.float32([[1,0,0],[0,1,dy]]); s=cv2.warpAffine(img,m,(T.W,T.H)).astype(np.float32)/255
    s=cv2.GaussianBlur(s,(3,3),0.8); v=s.ravel()-s.mean(); n=np.linalg.norm(v); return v/n if n>1e-6 else v
TM=[]; TL=[]; TW=[]
for i,lab in zip(tidx,tlab):
    for dy in (-1,0,1):
        TM.append(shifted(imgs[i],dy)); TL.append(lab); TW.append(wid[i])
TM=np.stack(TM); TL=np.array(TL,dtype=object); TW=np.array(TW)
print("glyphs",len(gl),"templates",len(tidx),flush=True)
labels=[]; sim=np.zeros(len(gl),np.float32); marg=np.zeros(len(gl),np.float32)
forced={int(k):v for k,v in extra.items()}
for idx in range(len(gl)):
    if idx in forced: labels.append(forced[idx]); sim[idx]=marg[idx]=1; continue
    w=wid[idx]; m=np.abs(TW-w)<=max(3,0.3*w)
    if not m.any(): labels.append("?"); continue
    s=TM[m]@V[idx]; tl=TL[m]; b=int(np.argmax(s)); l=tl[b]
    o=s[tl!=l]
    labels.append(l if s[b]>=0.6 else "?"); sim[idx]=s[b]; marg[idx]=s[b]-(o.max() if o.size else 0)
old=[gm.label_of(g) for g in gl]
print("changed vs cluster labels:",sum(a!=b for a,b in zip(old,labels)))
json.dump(labels,open(out+"/glyph_final.json","w"),ensure_ascii=False)
np.savez(out+"/glyph_scores.npz",sim=sim,marg=marg)
# least certain glyphs among those that matter for moves
MOVE=set("KQRBN0123456789")
cand=[(float(min(sim[i],0.6+marg[i])),i) for i,l in enumerate(labels) if i not in forced and l and (set(l)&MOVE)]
cand.sort(); hard=[i for _,i in cand[:200]]
json.dump([[i,labels[i]] for i in hard],open(out+"/ghard.json","w"),ensure_ascii=False)
cols,sc=20,2; cw,ch=T.W*sc+6,T.H*sc+16
im=np.full((10*ch,cols*cw),255,np.uint8)
for n,i in enumerate(hard):
    r,q=divmod(n,cols); y,x=r*ch,q*cw
    im[y+14:y+14+T.H*sc,x+3:x+3+T.W*sc]=cv2.resize(255-imgs[i],(T.W*sc,T.H*sc),interpolation=cv2.INTER_NEAREST)
    cv2.putText(im,f"{n}:{labels[i]}",(x+2,y+11),cv2.FONT_HERSHEY_SIMPLEX,0.4,0,1)
cv2.imwrite(out+"/ghard.png",im)
print("low margin (<0.05) among move glyphs:",sum(1 for c,_ in cand if c<0.65))

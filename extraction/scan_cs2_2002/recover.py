import sys,pickle,collections,pymupdf,cv2,numpy as np
from csx import boards as B
pdf,out=sys.argv[1:]
P=pickle.load(open(out+"/pieces.pkl","rb")); meta=list(P["meta"]); n0=len(meta)
LAST=209                                    # 0-based index of the last exercise page
by=collections.defaultdict(list)
for i,(p,x,y,s) in enumerate(meta):
    if p<=LAST: by[p].append(i)
print("false detections after the last exercise page:",sum(1 for m in meta if m[0]>LAST))
slot=lambda x,y:(int(x>450), int(round((y-186)/538)))
full=[p for p,v in by.items() if len(v)==6]
med={}
for c in (0,1):
    for r in (0,1,2):
        v=[meta[i] for p in full for i in by[p] if slot(meta[i][1],meta[i][2])==(c,r)]
        med[(c,r)]=(np.median([m[1] for m in v]),np.median([m[2] for m in v]),np.median([m[3] for m in v]))
d=pymupdf.open(pdf); new=[]
for p in sorted(by):
    if len(by[p])==6: continue
    have={slot(meta[i][1],meta[i][2]):meta[i] for i in by[p]}
    offx=np.median([m[1]-med[k][0] for k,m in have.items()]); offy=np.median([m[2]-med[k][1] for k,m in have.items()])
    gray=B.render_page(d[p],200)
    for k in med:
        if k in have: continue
        px,py,ps=med[k][0]+offx,med[k][1]+offy,med[k][2]
        best=None
        for sz in (ps*0.985,ps,ps*1.015):
            for dx in range(-14,15,2):
                for dy in range(-14,15,2):
                    fr,ct=B._checker_score(gray,px+dx,py+dy,sz)
                    key=fr+min(ct,80)/400
                    if best is None or key>best[0]: best=(key,fr,ct,px+dx,py+dy,sz)
        b=B.Board(p,best[3],best[4],best[5],best[1]); B.extract_cells(gray,b)
        print("page",p+1,"slot",k,"recovered, checker fraction %.2f contrast %.0f"%(best[1],best[2]))
        new.append((b.page,b.x,b.y,b.size,b.score,b.cells,b.crop))
pickle.dump(new,open(out+"/boards_extra.pkl","wb"))
bstd=np.zeros((len(new),64),np.float32)
for i,r in enumerate(new):
    for j in range(64): bstd[i,j]=cv2.GaussianBlur(r[5][j],(0,0),2.0)[3:-3,3:-3].std()
if len(P["bstd"])==n0:
    P["meta"]=meta+[(r[0],r[1],r[2],r[3]) for r in new]; P["bstd"]=np.vstack([P["bstd"],bstd])
    pickle.dump(P,open(out+"/pieces.pkl","wb"))
print("boards now",len(P["meta"]),"exercise boards",sum(1 for m in P["meta"] if m[0]<=LAST))

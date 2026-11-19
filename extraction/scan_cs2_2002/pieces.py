import sys, pickle, cv2, numpy as np
from csx import boards as B
out=sys.argv[1]; TH=float(sys.argv[2]) if len(sys.argv)>2 else 0.80
def sv(cell):
    v=cv2.GaussianBlur(cell,(0,0),SIG).astype(np.float32).ravel(); v-=v.mean(); n=np.linalg.norm(v)
    return v/n if n>1e-6 else v
SIG=float(sys.argv[3]) if len(sys.argv)>3 else 2.0
raw=pickle.load(open(out+"/boards.pkl","rb"))
N=len(raw)
cells=np.stack([r[5] for r in raw])            # (N,64,32,32)
meta=[(r[0],r[1],r[2],r[3]) for r in raw]
bstd=np.zeros((N,64),np.float32)
for i in range(N):
    for j in range(64):
        bstd[i,j]=cv2.GaussianBlur(cells[i,j],(0,0),2.0)[3:-3,3:-3].std()
flat=bstd<17.0
print("empty cells",int(flat.sum()),"borderline(13-22)",int(((bstd>13)&(bstd<22)).sum()))
vec=np.zeros((N,64,1024),np.float32)
for i in range(N):
    for j in range(64):
        vec[i,j]=sv(cells[i,j])
assign=np.full((N,64),-1,np.int32)
cent=[np.zeros((6000,1024),np.float32),np.zeros((6000,1024),np.float32)]
cid=[[],[]]; count=[]; exemplar=[]; cdark=[]
FLAT=[None,None]
for i in range(N):
    for j in range(64):
        dk=int(B.is_dark(j))
        if flat[i,j]:
            if FLAT[dk] is None:
                FLAT[dk]=len(count); count.append(0); exemplar.append(cells[i,j].copy()); cdark.append(dk)
            assign[i,j]=FLAT[dk]; count[FLAT[dk]]+=1; continue
        k=len(cid[dk]); v=vec[i,j]
        if k:
            s=cent[dk][:k]@v; b=int(np.argmax(s))
            if s[b]>=TH:
                g=cid[dk][b]; assign[i,j]=g; count[g]+=1
                if count[g]<=40:
                    c=cent[dk][b]*(count[g]-1)+v; cent[dk][b]=c/(np.linalg.norm(c)+1e-9)
                continue
        cent[dk][k]=v; cid[dk].append(len(count)); assign[i,j]=len(count)
        count.append(1); exemplar.append(cells[i,j].copy()); cdark.append(dk)
order=sorted(range(len(count)),key=lambda c:-count[c])
cnt=np.array([count[c] for c in order]); cum=np.cumsum(cnt)/cnt.sum()
print("cells",N*64,"clusters",len(count),"cover top50 %.4f top100 %.4f top200 %.4f top300 %.4f"%tuple(cum[min(k,len(cum)-1)] for k in (49,99,199,299)))
print("singletons",int((cnt==1).sum()))
pickle.dump(dict(bstd=bstd,assign=assign,count=count,exemplar=exemplar,cdark=cdark,order=order,meta=meta),open(out+"/pieces.pkl","wb"))
def sheet(ids,base,cols=15,sc=3):
    cw,ch=32*sc+8,32*sc+18
    rows=(len(ids)+cols-1)//cols
    im=np.full((rows*ch,cols*cw),255,np.uint8)
    for n,c in enumerate(ids):
        r,q=divmod(n,cols); y,x=r*ch,q*cw
        im[y+16:y+16+32*sc,x+4:x+4+32*sc]=cv2.resize(exemplar[c],(32*sc,32*sc),interpolation=cv2.INTER_NEAREST)
        cv2.putText(im,f"{base+n} x{count[c]}",(x+2,y+12),cv2.FONT_HERSHEY_SIMPLEX,0.4,0,1)
    return im
for k in range(0,min(len(order),300),150):
    cv2.imwrite(f"{out}/psheet_{k}.png",sheet(order[k:k+150],k))

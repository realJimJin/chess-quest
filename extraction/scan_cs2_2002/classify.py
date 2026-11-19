import sys, json, pickle, cv2, numpy as np
from csx import boards as B
out=sys.argv[1]; SIG=float(sys.argv[2]) if len(sys.argv)>2 else 1.0
P=pickle.load(open(out+"/pieces.pkl","rb")); lab=json.load(open(out+"/piece_labels.json"))
import os
extra=json.load(open(out+"/piece_extra.json")) if os.path.exists(out+"/piece_extra.json") else []
round_=sys.argv[3] if len(sys.argv)>3 else '1'
raw=pickle.load(open(out+"/boards.pkl","rb"))+pickle.load(open(out+"/boards_extra.pkl","rb"))
cells=np.stack([r[5] for r in raw]); N=len(cells); del raw
order=P["order"]; ex=P["exemplar"]; cdark=P["cdark"]; bstd=P["bstd"]
def sv(img):
    v=cv2.GaussianBlur(img,(0,0),SIG).astype(np.float32).ravel(); v-=v.mean(); n=np.linalg.norm(v); return v/n if n>1e-6 else v
T=[[],[]]; TL=[[],[]]
def add(img,dark,label):
    for dy in (-2,-1,0,1,2):
        for dx in (-2,-1,0,1,2):
            m=np.float32([[1,0,dx],[0,1,dy]])
            T[dark].append(sv(cv2.warpAffine(img,m,(32,32),borderMode=cv2.BORDER_REPLICATE))); TL[dark].append(label)
for r,c in enumerate(order):
    l=lab[str(r)]
    if r>1: add(ex[c],cdark[c],l)
for i,j,l in extra:                      # hand-labelled hard cases: (board, cell, label)
    add(cells[i,j],int(B.is_dark(j)),l)
T=[np.stack(t) for t in T]; TL=[np.array(t) for t in TL]
print("templates",[len(t)//25 for t in T])
LAB=np.full((N,64),"empty",dtype="<U5"); SIM=np.ones((N,64),np.float32); MARG=np.ones((N,64),np.float32)
forced={(i,j):l for i,j,l in extra}
for i in range(N):
    for j in range(64):
        if (i,j) in forced: LAB[i,j]=forced[(i,j)]; continue
        if bstd[i,j]<17: continue
        dk=int(B.is_dark(j)); s=T[dk]@sv(cells[i,j])
        b=int(np.argmax(s)); l=TL[dk][b]
        other=s[TL[dk]!=l]
        LAB[i,j]=l; SIM[i,j]=s[b]; MARG[i,j]=s[b]-(other.max() if other.size else 0)
occ=(bstd>=17)
print("occupied",int(occ.sum()),"sim<0.7:",int((SIM[occ]<0.7).sum()),"sim<0.8:",int((SIM[occ]<0.8).sum()),"margin<0.05:",int((MARG[occ]<0.05).sum()),"margin<0.1:",int((MARG[occ]<0.1).sum()))
print('occupied-but-empty',int(((LAB=='empty')&occ).sum()))
kings=np.array([[(LAB[i]=="K").sum(),(LAB[i]=="k").sum()] for i in range(N)])
print("boards with exactly one king each:",int(((kings[:,0]==1)&(kings[:,1]==1)).sum()),"of",N)
np.savez(out+"/cell_labels.npz",LAB=LAB,SIM=SIM,MARG=MARG)
# sheet of the least certain occupied cells for hand labelling
cand=[(float(min(SIM[i,j],0.6+MARG[i,j])),i,j) for i in range(N) for j in range(64) if occ[i,j] and (i,j) not in forced and LAB[i,j]!='empty']
cand.sort(); hard=cand[:150]
json.dump([[i,j,str(LAB[i,j])] for _,i,j in hard],open(out+"/hard.json","w"))
cols,sc=15,3; cw,ch=32*sc+8,32*sc+18
im=np.full((10*ch,cols*cw),255,np.uint8)
for n,(_,i,j) in enumerate(hard):
    r,q=divmod(n,cols); y,x=r*ch,q*cw
    im[y+16:y+16+96,x+4:x+100]=cv2.resize(cells[i,j],(96,96),interpolation=cv2.INTER_NEAREST)
    cv2.putText(im,f"{n} {LAB[i,j]} {SIM[i,j]:.2f}",(x+2,y+12),cv2.FONT_HERSHEY_SIMPLEX,0.4,0,1)
cv2.imwrite(out+"/hard.png",im)

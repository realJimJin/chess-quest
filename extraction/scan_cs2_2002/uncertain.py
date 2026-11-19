import sys,pickle,numpy as np
out=sys.argv[1]
Z=np.load(out+"/cell_labels.npz"); LAB=Z["LAB"]; SIM=Z["SIM"]; MARG=Z["MARG"]
raw=pickle.load(open(out+"/boards.pkl","rb"))+pickle.load(open(out+"/boards_extra.pkl","rb"))
cells=np.stack([r[5] for r in raw]); score=np.array([r[4] for r in raw]); del raw
ink=(255-cells[:,:,4:-4,6:-6].reshape(len(cells),64,-1).astype(np.float32)).mean(axis=2)/255
par=np.array([(j//8+j%8)%2 for j in range(64)],bool)
TH={("K",0):.506,("K",1):.527,("Q",0):.567,("Q",1):.608,("R",0):.509,("R",1):.557,("B",0):.463,("B",1):.546,("N",0):.298,("N",1):.334,("P",0):.218,("P",1):.377}
occ=LAB!="empty"
unc=occ&((SIM<0.75)|(MARG<0.05))
for (t,dk),th in TH.items():
    m=(np.char.upper(LAB)==t)&(par[None,:]==bool(dk))
    unc|=m&((ink>th)!=(LAB==t.lower()))
unc[score<0.8,0]=True      # weakly aligned (recovered) boards are always reviewed
print("uncertain cells",int(unc.sum()),"boards affected",int(unc.any(axis=1).sum()))
np.save(out+"/cell_uncertain.npy",unc)

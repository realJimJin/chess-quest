import sys, pickle, json, re, collections
from csx import textocr as T
out=sys.argv[1]
gl,m=pickle.load(open(out+"/glyphs.pkl","rb"))
order=m.order()
U="?"
L={}
def put(base, items):
    for k,v in enumerate(items): L[base+k]=v
put(0,['.','.','K','Q','1','+','8','d','R','6', 'b','b','7','e','3','.','5','1','g','g',
 '2','e','4','a',':','6','2','4','f','7', 'e','5','B','+','+',':','9','3',',','c',
 'K','h','.','N','5','N','K','4',U,'a', U,':','1','№',',',U,U,'a',U,'[',
 U,'1','6',U,'R','-','№',U,':','#', '9',']','f7','R',U,']',',','c','f8','-',
 U,'5','3','2','B','4','8','2','3','9', '0',U,'f',':',U,'c',U,'.','.','5'])
put(100,['0',U,'f3',U,'+',U,U,'B','f2',U, '-','d',U,'g',U,'N',U,U,U,'7',
 U,'8','6',U,U,'h','7','O',U,'-', 'f','3',U,'7',U,';',U,U,U,U,
 U,'f7',U,U,'9',U,'7','1',U,'c4', U,U,U,'-','-',U,U,'c4','6','=',
 U,U,'a',U,U,'a',U,'Q','!','c', ';',U,'f3','f8',U,'9','№',U,'1',U,
 U,U,'6',U,U,'64',U,U,'3',U, 'e6','a','h','a',U,U,U,U,'~','g2'])
put(200,['e','-',U,U,',',')','a',U,'e','b', U,'c',U,'+','(','f8','.','e8',';',U,
 '9','h',U,U,'+',U,'~','-',U,'-', '№',U,U,'7','e','6','h','=',U,U,
 U,'-','1',U,U,'K','g','8',U,U, '.','+','.','f2','Q','b',U,U,'.','6',
 U,U,U,U,U,'.','d',U,'2','d', 'Q',':',U,U,U,'5','4','3',U,U,
 'h','a',U,'e','=',':','K','6',U,U, U,U,'5','~',U,U,U,U,'8','7'])
put(300,[':',':','+',U,'~','8','7','7','-','f', 'c','~',U,'~',U,'90',U,U,'7','gf',
 U,'-',U,'4','1','0',U,U,':','.', U,U,U,U,'7','Q','d',U,'-','1',
 '2',':','d','c',U,U,U,'3',U,U, '4+',U,U,'b',',','d','5','3','a2','44',
 '6.',U,'2',U,U,U,U,'5','4=',U, 'N',U,'g','.','6',U,U,U,U,'f8',
 U,'#','a,',U,',','0','2','a','d2',U, 'g6',U,'[',U,'6#',U,U,'(','6','R'])
assert len(L)==400
by_hash={T._hash(m.exemplar[order[r]]):lab for r,lab in L.items()}
json.dump(by_hash,open(out+"/glyph_labels.json","w"),ensure_ascii=False)
m.load_labels(out+"/glyph_labels.json")
txt=T.read_text(gl,m)
open(out+"/answers.txt","w").write(txt)
heads=[int(x) for x in re.findall(r"№\s*(\d{1,4})",txt)]
print("chars",len(txt),"headers",len(heads),"unique",len(set(heads)),"in 1..1176:",len(set(heads)&set(range(1,1177))))
miss=sorted(set(range(1,1177))-set(heads)); print("missing",len(miss),miss[:60])
dup=[k for k,v in collections.Counter(heads).items() if v>1]; print("dups",dup[:30])
print("unknown share", round(txt.count("?")/max(1,len(txt)),3))

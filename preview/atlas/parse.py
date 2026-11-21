import re,json
cur=None;out=[]
for line in open('cosmic-catalog.md'):
    m=re.match(r'### (\d[a-z])\. (.*)',line)
    if m: cur=m.group(2).strip(); continue
    m=re.match(r'\| ([BPW]\d+) \| (.*?) \| (.*?) \| (.*?) \| (\w\w) \| (\w+) \|',line)
    if m: out.append([m.group(1),m.group(2),m.group(3),m.group(4),m.group(5),m.group(6),cur])
secs=[]
for o in out:
    if o[6] not in secs: secs.append(o[6])
print(len(out)); print(secs)
json.dump(out,open('data.json','w'),separators=(',',':'))

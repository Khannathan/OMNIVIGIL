import json,sys
CH='abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()+=-_~?<>/;:[]{}'
def encode(grid_rows_tokens):
    toks=sorted({t for r in grid_rows_tokens for t in r})
    key={t:CH[i] for i,t in enumerate(toks)}
    rows=[]
    for r in grid_rows_tokens:
        s=''.join(key[t] for t in r)
        rows.append('|'.join(s[i:i+8] for i in range(0,len(s),8)))
    return {v:k for k,v in key.items()},rows

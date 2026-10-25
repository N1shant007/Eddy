"""Fine-grained SRT (one block per spoken segment) from segs.json + a speaker function. Usage via import."""
def ts(x):
    h=int(x//3600);m=int(x%3600//60);sec=x%60;ms=int(round((sec-int(sec))*1000))
    if ms==1000: ms=999
    return f"{h:02d}:{m:02d}:{int(sec):02d},{ms:03d}"
def write(blocks,srt_path,txt_path):
    open(srt_path,'w').write('\n'.join(f"{i}\n{ts(a)} --> {ts(b)}\n{spk}: {t}\n" for i,(a,b,spk,t) in enumerate(blocks,1)))
    # plain script: one line per speaker turn
    turns=[]
    for a,b,spk,t in blocks:
        if turns and turns[-1][0]==spk: turns[-1][1]+=' '+t
        else: turns.append([spk,t])
    open(txt_path,'w').write('\n'.join(f"{s}: {t}" for s,t in turns)+'\n')

"""Build a standalone eddy.html with the team library embedded. Usage: build_local.py <app.html> <teamdir> <out.html>"""
import sys,json,base64,os
app,team,out=sys.argv[1:4]
lib=json.load(open(os.path.join(team,'library.json')))
files={a['file']:base64.b64encode(open(os.path.join(team,a['file']),'rb').read()).decode() for a in lib['assets'] if not a.get('builtin')}
blob=json.dumps({'lib':lib,'files':files}).replace('</','<\\/')
html=open(app).read()
shell_head='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eddy</title></head><body>'
body=html if html.lstrip().lower().startswith('<!doctype') else shell_head+html+'</body></html>'
tag='<script type="application/json" id="teamEmbed">'+blob+'</script>'
i=body.find('<script>'); body=body[:i]+tag+body[i:]
open(out,'w').write(body);print(len(files),'audio files embedded,',round(os.path.getsize(out)/1e6,1),'MB')

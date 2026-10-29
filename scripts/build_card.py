"""Build a native .dshcard from checked-out code and prepared independent media."""
import hashlib,json,zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
BASE=ROOT/'pokemon-kanto'
MEDIA_EXT={'.png','.jpg','.jpeg','.gif','.webp','.ogg','.mp3','.wav','.mp4','.webm','.glb','.svg'}

def build():
 version=json.loads((BASE/'package.json').read_text(encoding='utf8'))['version']
 meta=json.loads((ROOT/'card-source/dsh.json').read_text(encoding='utf8'))
 if version!=meta['card']['version']:raise ValueError('Card and plugin version differ')
 mappings={'kanto-media':BASE/'public/assets','kanto-animated-096':ROOT/'resources/kanto-animated-096','kanto-fx-1027':ROOT/'resources/kanto-fx-1027'}
 for key,source in mappings.items():
  if not source.is_dir() or not any(source.iterdir()):raise ValueError(f'Missing {key}; run scripts/fetch_assets.py')
 files={};prefix='plugins/pokemon-kanto/'
 def add(name,path=None,data=None):
  if name in files:raise ValueError('Duplicate package entry: '+name)
  files[name]=(path,data)
 for name in ['card.json','dsh.json','assets/icon/images/main.png']:add(name,ROOT/'card-source'/name)
 excluded={'import-tile-world.cjs','test-stadium-sprites.cjs','tile-world-data.json'}
 for path in sorted(BASE.iterdir()):
  if path.is_file() and (path.suffix in {'.cjs','.mjs','.json'} or path.name=='tile-world-data.json.br') and path.name not in excluded:add(prefix+path.name,path)
 add(prefix+'README.md',BASE/'README.md')
 add(prefix+'client.js',data=('if(!window.KantoShinyFx){\n'+(BASE/'public/shiny-fx.js').read_text(encoding='utf8')+'\n}\n'+(BASE/'client.js').read_text(encoding='utf8')).encode())
 for folder in ['public','vendor']:
  for path in sorted((BASE/folder).rglob('*')):
   if not path.is_file():continue
   relative=path.relative_to(BASE).as_posix()
   if relative.startswith('public/assets/') or relative in {'public/tile-world-ui.js','public/tile-world-ui.css'}:continue
   add(prefix+relative,path)
 for name in ['audio.json','battle-terrain.json','battle-animated.json']:add(prefix+'assets/web/data/'+name,BASE/'public/data'/name)
 for key,source in mappings.items():
  pack_prefix='assets/'+key+('/assets/' if key=='kanto-media' else '/')
  for path in sorted(source.rglob('*')):
   if path.is_file():add(pack_prefix+path.relative_to(source).as_posix(),path)
 if any(n.startswith(prefix) and Path(n).suffix in MEDIA_EXT for n in files):raise ValueError('Media must be outside the plugin')
 out=ROOT/'dist';out.mkdir(exist_ok=True);target=out/f'pokemon-frlg-{version}.dshcard';temporary=target.with_suffix('.tmp')
 records=[]
 try:
  with zipfile.ZipFile(temporary,'w',allowZip64=True,compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
   for name,(path,data) in sorted(files.items()):
    content=data if data is not None else path.read_bytes()
    info=zipfile.ZipInfo(name,date_time=(2026,10,29,0,0,0));info.compress_type=zipfile.ZIP_STORED if Path(name).suffix.lower() in MEDIA_EXT else zipfile.ZIP_DEFLATED
    info.external_attr=0o100644<<16
    z.writestr(info,content,compresslevel=6)
    records.append({'path':name,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
  with zipfile.ZipFile(temporary) as z:
   if z.testzip() is not None:raise ValueError('Package CRC check failed')
  temporary.replace(target)
 finally:
  if temporary.exists():temporary.unlink()
 h=hashlib.sha256()
 with target.open('rb') as stream:
  for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
 digest=h.hexdigest()
 report={'version':version,'artifact':target.name,'bytes':target.stat().st_size,'sha256':digest,'entries':len(records),'pluginBytes':sum(r['bytes'] for r in records if r['path'].startswith(prefix)),'installed':False,'files':records}
 (out/'build-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 (out/'SHA256SUMS.txt').write_text(digest+'  '+target.name+'\n',encoding='ascii')
 print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=True))
 return report

if __name__=='__main__':build()

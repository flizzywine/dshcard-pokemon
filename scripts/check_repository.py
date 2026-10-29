"""Validate source layout, runtime media references and public documentation."""
import json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
BASE=ROOT/'pokemon-kanto'

def check():
 version=json.loads((BASE/'package.json').read_text(encoding='utf8'))['version']
 card=json.loads((ROOT/'card-source/card.json').read_text(encoding='utf8'))
 meta=json.loads((ROOT/'card-source/dsh.json').read_text(encoding='utf8'))
 assert version==meta['card']['version']==card['data']['character_version']
 assert meta['requires']['tavernApi']==4
 assert len(meta['plugins'])==1 and len(meta['packs'])==3
 assert (BASE/'vendor/showdown/sim/battle.js').is_file(),'Vendored engine missing'
 roots=[BASE/'public',ROOT/'resources/kanto-animated-096']
 missing=[]
 def walk(value,context):
  if isinstance(value,str) and value.startswith('assets/'):
   if not any((root/value).is_file() for root in roots):missing.append(context+': '+value)
  elif isinstance(value,list):
   for i,v in enumerate(value):walk(v,f'{context}[{i}]')
  elif isinstance(value,dict):
   for key,v in value.items():walk(v,context+'.'+key)
 for name in ['trainers.json','npc-portraits.json','backgrounds.json','pokemon-artwork.json','story-scenery.json','audio.json','story-audio.json','battle-terrain.json','battle-animated.json']:
  walk(json.loads((BASE/'public/data'/name).read_text(encoding='utf8')),name)
 for row in json.loads((BASE/'public/data/ordinary-effects.json').read_text(encoding='utf8')):
  for key in ['file','poster']:
   if not (ROOT/'resources/kanto-fx-1027'/row['profile'][key]).is_file():missing.append(row['id']+': '+row['profile'][key])
 assert not missing,'Unresolved runtime media: '+str(missing[:20])
 for name in ['battle-desktop.png','battle-mobile.png','effect-gallery.png']:
  assert (ROOT/'docs/images'/name).read_bytes().startswith(b'\x89PNG\r\n\x1a\n'),name
 for name in ['README.md','CONTRIBUTING.md','SECURITY.md','THIRD_PARTY_NOTICES.md','docs/TESTING.md','docs/ARCHITECTURE.md']:
  path=ROOT/name
  for match in re.finditer(r'!?\[[^\]]*\]\(([^)]+)\)',path.read_text(encoding='utf8')):
   target=match.group(1).split('#')[0]
   if not target or '://' in target or target.startswith('mailto:'):continue
   assert (path.parent/target).exists(),f'{name}: broken local link {target}'
 print(json.dumps({'ok':True,'version':version,'runtimeReferences':'resolved','screenshots':3,'nativeApi':4}))

if __name__=='__main__':check()

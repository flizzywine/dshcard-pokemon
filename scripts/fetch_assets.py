"""Prepare pinned release media without installing anything into DSH Tavern."""
import argparse,hashlib,json,shutil,urllib.request,zipfile
from pathlib import Path,PurePosixPath

ROOT=Path(__file__).resolve().parent.parent
PREFIXES={'assets/kanto-media/assets/':ROOT/'pokemon-kanto/public/assets',
 'assets/kanto-animated-096/':ROOT/'resources/kanto-animated-096',
 'assets/kanto-fx-1027/':ROOT/'resources/kanto-fx-1027'}

def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def prepare(archive,manifest):
 if archive.stat().st_size!=manifest['bytes'] or digest(archive)!=manifest['sha256']:
  raise ValueError('Archive differs from the pinned release. Check size and SHA256; nothing extracted.')
 count=0
 with zipfile.ZipFile(archive) as z:
  selected=[];seen=set();total=0
  for info in z.infolist():
   if info.is_dir():continue
   for prefix,base in PREFIXES.items():
    if info.filename.startswith(prefix):
     suffix=info.filename[len(prefix):];parts=PurePosixPath(suffix).parts
     if not parts or '\\' in suffix or ':' in suffix or any(p in ('..','.') for p in parts):raise ValueError('Unsafe archive member')
     destination=base.joinpath(*parts).resolve()
     if not destination.is_relative_to(base.resolve()) or destination in seen:raise ValueError('Duplicate or escaped member')
     seen.add(destination);selected.append((info,destination));total+=info.file_size
  if not selected or total>2*1024**3:raise ValueError('Invalid media set')
  for info,destination in selected:
   destination.parent.mkdir(parents=True,exist_ok=True)
   temporary=destination.with_name(destination.name+'.download')
   try:
    with z.open(info) as source,temporary.open('wb') as output:shutil.copyfileobj(source,output)
    temporary.replace(destination);count+=1
   finally:
    if temporary.exists():temporary.unlink()
 print(f'Prepared {count} pinned media files; no DSH installation or player data accessed.')

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=Path,help='Existing original release .dshcard');args=p.parse_args()
 manifest=json.loads((ROOT/'release-manifest.json').read_text(encoding='utf8'))
 archive=args.archive
 if archive is None:
  archive=ROOT/'.cache'/manifest['asset'];archive.parent.mkdir(parents=True,exist_ok=True)
  if not archive.exists() or archive.stat().st_size!=manifest['bytes'] or digest(archive)!=manifest['sha256']:
   temporary=archive.with_suffix('.download');print('Downloading pinned release media (~545 MiB)...',flush=True)
   request=urllib.request.Request(manifest['url'],headers={'User-Agent':'dshcard-pokemon-assets/1.0'})
   try:
    with urllib.request.urlopen(request,timeout=120) as source,temporary.open('wb') as target:shutil.copyfileobj(source,target)
    if temporary.stat().st_size!=manifest['bytes'] or digest(temporary)!=manifest['sha256']:raise ValueError('Download checksum mismatch')
    temporary.replace(archive)
   finally:
    if temporary.exists():temporary.unlink()
 prepare(archive,manifest)

if __name__=='__main__':main()

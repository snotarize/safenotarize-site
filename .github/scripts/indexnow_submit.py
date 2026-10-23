#!/usr/bin/env python3
"""SafeNotarize IndexNow submissions. Manual GitHub Actions invocation ONLY."""
import argparse, json, re, subprocess, sys, time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.robotparser import RobotFileParser
from html.parser import HTMLParser
import xml.etree.ElementTree as ET

HOST = 'safenotarize.com'  # Actual canonical host in existing sitemap/CNAME.
ORIGIN = f'https://{HOST}'
ENDPOINT = 'https://api.indexnow.org/indexnow'
KEY_FILE = next((p for p in Path('.').glob('*.txt') if re.fullmatch(r'[a-f0-9]{32}\.txt', p.name)), None)
EXCLUDE = {'404.html', 'book.html', 'book-ht.html', 'start.html', 'start-ht.html', 'scheduled.html', 'upload.html', 'pay.html', 'thank-you.html', 'delete-data.html'}

class HeadParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.canon=[]; self.robots=[]
    def handle_starttag(self,tag,attrs):
        if tag!='link' and tag!='meta': return
        a=dict(attrs)
        if tag=='link' and 'canonical' in a.get('rel','').lower().split(): self.canon.append(a.get('href',''))
        if tag=='meta' and a.get('name','').lower() in ('robots','googlebot','bingbot'): self.robots.append(a.get('content','').lower())

def urls_from_sitemap(data):
    root=ET.fromstring(data)
    return {n.text.strip() for n in root.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc') if n.text}

def url_for_path(path):
    if path=='index.html': return ORIGIN+'/'
    return ORIGIN+'/'+path

def eligible(path, root, sitemap, robots):
    if not path.endswith('.html') or path in EXCLUDE or path.startswith('book/') or path.startswith('.github/'):
        return False
    f=root/path
    if not f.is_file():return False
    u=url_for_path(path); x=urlsplit(u)
    if x.scheme!='https' or x.netloc!=HOST or x.query or x.fragment or u not in sitemap:return False
    if not robots.can_fetch('*',u):return False
    p=HeadParser();p.feed(f.read_text(encoding='utf-8'))
    if len(p.canon)!=1 or p.canon[0]!=u:return False
    if any('noindex' in q or 'none' in q for q in p.robots):return False
    return True

def fetch(url, method='GET'):
    req=Request(url,method=method,headers={'User-Agent':'SafeNotarize-IndexNow/1.0'})
    try:
        with urlopen(req,timeout=18) as res: return res.status,res.read(1024)
    except HTTPError as e: return e.code,b''

def git(*args):
    return subprocess.check_output(['git',*args],text=True).strip()

def existing_ref(ref):
    if not re.fullmatch(r'[0-9a-fA-F]{40}',ref):raise ValueError('Base must be a full 40-character commit SHA.')
    git('cat-file','-e',ref+'^{commit}')
    return ref

def old_eligible(path, rev):
    try:
        old_sitemap=urls_from_sitemap(subprocess.check_output(['git','show',rev+':sitemap.xml']))
        old_robots=subprocess.check_output(['git','show',rev+':robots.txt'],text=True)
        old_content=subprocess.check_output(['git','show',rev+':'+path],text=True)
    except subprocess.CalledProcessError:return False
    u=url_for_path(path)
    if u not in old_sitemap or not path.endswith('.html') or path in EXCLUDE:return False
    if re.search(r'(?im)^\s*disallow:\s*/'+re.escape(path)+r'\s*$',old_robots):return False
    p=HeadParser();p.feed(old_content)
    return len(p.canon)==1 and p.canon[0]==u and not any('noindex' in q or 'none' in q for q in p.robots)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--mode',choices=['initial','changed'],required=True)
    ap.add_argument('--base',default='')
    ap.add_argument('--dry-run',action='store_true')
    a=ap.parse_args()
    if KEY_FILE is None:raise RuntimeError('No unique IndexNow key file at publishing root')
    key=KEY_FILE.stem
    if KEY_FILE.read_text().strip()!=key:raise RuntimeError('Invalid key file content')
    root=Path('.')
    sitemap=urls_from_sitemap((root/'sitemap.xml').read_bytes())
    assert sitemap and all(urlsplit(u).scheme=='https' and urlsplit(u).netloc==HOST for u in sitemap),'Sitemap host mismatch: abort'
    robots=RobotFileParser();robots.parse((root/'robots.txt').read_text().splitlines())
    candidates=[]; deletions=[]
    if a.mode=='initial':
        candidates=[str(p) for p in root.rglob('*.html')]
    else:
        old=existing_ref(a.base)
        subprocess.run(['git','merge-base','--is-ancestor',old,'HEAD'],check=True)
        diff=git('diff','--name-status','--no-renames',old,'HEAD','--','*.html')
        for line in diff.splitlines():
            status,path=line.split('\t',1)
            if status in ('A','M','T'):candidates.append(path)
            elif status=='D' and old_eligible(path,old):deletions.append(url_for_path(path))
    selected=sorted({url_for_path(path.removeprefix('./')) for path in candidates if eligible(path.removeprefix('./'),root,sitemap,robots)})
    print(f'Mode={a.mode}; sitemap={len(sitemap)}; eligible changed/public={len(selected)}; deletion candidates={len(deletions)}')
    if a.dry_run:
        print('DRY RUN URLs:',json.dumps(selected+deletions,indent=2));return
    # Wait for the key to actually be published; fail closed on errors.
    code,body=fetch(f'{ORIGIN}/{key}.txt')
    if code!=200 or body.decode().strip()!=key:raise RuntimeError(f'IndexNow key file not live on canonical host (HTTP {code}); submission blocked')
    safe=[]
    for u in selected:
        code,_=fetch(u)
        if code==200:safe.append(u)
        else:print(f'SKIP unpublished or unavailable URL: {u} (HTTP {code})')
    for u in deletions:
        # Only notify when actual production URL returns 404/410, not on partial upload.
        code,_=fetch(u)
        if code in (404,410):safe.append(u)
        else:print(f'SKIP deletion (live status={code}): {u}')
    safe=sorted(set(safe))
    if not safe:print('No verified eligible URLs to submit.');return
    print(f'Submitting {len(safe)} verified URLs; log excludes document contents and all query data')
    payload=json.dumps({'host':HOST,'key':key,'keyLocation':f'{ORIGIN}/{key}.txt','urlList':safe}).encode()
    for attempt in range(1,4):
        req=Request(ENDPOINT,data=payload,method='POST',headers={'Content-Type':'application/json; charset=utf-8','User-Agent':'SafeNotarize-IndexNow/1.0'})
        try:
            with urlopen(req,timeout=25) as r:code=r.status
        except HTTPError as e:code=e.code
        except (URLError,TimeoutError) as e:
            if attempt<3:time.sleep(attempt*2);continue
            raise RuntimeError(f'Network submission failed after retries: {type(e).__name__}')
        print(f'IndexNow response: HTTP {code} (attempt {attempt})')
        if code in (200,202):print('Notification accepted; NOT proof of indexing.');return
        if code not in (429,500,502,503,504) or attempt==3:raise RuntimeError(f'IndexNow HTTP {code}; manual review required')
        time.sleep(attempt*3)

if __name__=='__main__':main()

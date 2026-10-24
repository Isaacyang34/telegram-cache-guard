#!/usr/bin/env python3
"""
GitHub Auto Sync & Repository Publisher Tool
自動檢測本機憑證、於 GitHub 遠端自動建庫並完成推送。
"""
import subprocess
import urllib.request
import urllib.error
import json
import sys
import os

def get_git_credentials():
    try:
        p = subprocess.run(
            ['git', 'credential', 'fill'],
            input='protocol=https\nhost=github.com\n\n',
            text=True,
            capture_output=True,
            check=True
        )
        token = ''
        username = ''
        for line in p.stdout.splitlines():
            if line.startswith('password='):
                token = line.split('=', 1)[1].strip()
            elif line.startswith('username='):
                username = line.split('=', 1)[1].strip()
        return username, token
    except Exception as e:
        print(f"[-] 無法從 Git 認證管理員獲取憑證: {e}")
        return '', ''

def ensure_remote_repo(username, token, repo_name, description=""):
    url = f"https://api.github.com/repos/{username}/{repo_name}"
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitHub-Auto-Publisher'
    })
    
    try:
        with urllib.request.urlopen(req):
            print(f"[+] 遠端倉庫已存在: {username}/{repo_name}")
            return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"[*] 遠端倉庫不存在，正在自動透過 API 建立: {repo_name} ...")
            create_url = 'https://api.github.com/user/repos'
            payload = json.dumps({
                'name': repo_name,
                'description': description,
                'private': False
            }).encode('utf-8')
            create_req = urllib.request.Request(create_url, data=payload, headers={
                'Authorization': f'Bearer {token}',
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'GitHub-Auto-Publisher'
            })
            with urllib.request.urlopen(create_req) as resp:
                data = json.loads(resp.read())
                print(f"[+] 倉庫建立成功: {data.get('html_url')}")
                return True
        else:
            print(f"[-] 檢查遠端倉庫發生錯誤 (HTTP {e.code})")
            return False

def push_to_remote(repo_name, branch="main"):
    username, token = get_git_credentials()
    if not token or not username:
        print("[-] 錯誤：找不到本機 GitHub 憑證。")
        return False

    if not ensure_remote_repo(username, token, repo_name):
        return False

    remote_url = f"https://github.com/{username}/{repo_name}.git"
    
    # Check remote
    remotes = subprocess.run(['git', 'remote'], capture_output=True, text=True).stdout.splitlines()
    if 'origin' in remotes:
        subprocess.run(['git', 'remote', 'set-url', 'origin', remote_url], check=True)
    else:
        subprocess.run(['git', 'remote', 'add', 'origin', remote_url], check=True)

    print(f"[*] 正在推送代碼至 {remote_url} (分支: {branch}) ...")
    res = subprocess.run(['git', 'push', '-u', 'origin', branch], text=True)
    if res.returncode == 0:
        print(f"[+] 推送完成！請查看: {remote_url}")
        return True
    else:
        print("[-] 推送失敗。")
        return False

if __name__ == '__main__':
    name = sys.argv[1] if len(sys.argv) > 1 else 'telegram-cache-guard'
    push_to_remote(name)

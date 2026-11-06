# TAM 개발 브랜치와 Cloud Run 배포

## 1. 개발 시작

현재 PC가 최신 `main`과 동기화돼 있으므로 첫 작업은 아래처럼 시작한다. `git status`로 현재 브랜치가 `main`이고 작업 트리가 깨끗한지 확인한다.

```powershell
git status
git switch -c dev_01
```

## 2. 개발 중 커밋하고 푸시

`dev_01`에서 작업하는 동안 아래 순서를 반복한다. 검사에 실패하면 원인을 해결하고 다시 실행한다. 예시 경로는 실제 수정한 파일 경로로 바꾼다.

```powershell
npm.cmd run check
git status
git add -- "src/수정한파일.jsx"
git diff --cached --stat
git commit -m "작업 내용 요약"
git push origin dev_01
```

`.env`, 실제 엑셀 파일, 가계부 백업 JSON, DB 파일은 커밋에서 제외한다. `dev_01`에 푸시하는 동안 Cloud Run 자동 배포는 실행되지 않는다.

## 3. 운영에 배포할 때만 main에 합치기

GitHub에서 **base `main`**, **compare `dev_01`**으로 PR을 만들고, 검사가 통과하면 **Squash and merge**를 선택한다.

GitHub CLI를 사용한다면 아래 명령을 순서대로 실행한다. 검사가 통과한 뒤 마지막 명령을 실행한다.

```powershell
gh pr create --base main --head dev_01 --title "작업 내용 요약" --body "변경 내용과 검증 결과"
gh pr checks dev_01 --watch
gh pr merge dev_01 --squash
```

`DEPLOY_ENABLED=true`이면 PR이 `main`에 합쳐질 때 Cloud Run 자동 배포가 시작된다. GitHub의 **Actions → Deploy to Cloud Run**에서 배포 성공을 확인한 뒤 운영 주소에 접속한다.

## 4. 다음 작업 시작

PR이 합쳐진 뒤 로컬 `main`을 갱신하고 다음 작업 브랜치를 만든다.

```powershell
git switch main
git pull --ff-only origin main
git switch -c dev_02
```

다음부터는 `dev_03`, `dev_04`처럼 번호를 올리고 푸시와 PR 명령에도 해당 브랜치 이름을 사용한다.

param(
    [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function FullPath([string]$RelativePath) {
    return [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $RelativePath))
}

function Write-Utf8NoBom([string]$RelativePath, [string]$Content) {
    $path = FullPath $RelativePath
    [System.IO.File]::WriteAllText(
        $path,
        $Content,
        (New-Object System.Text.UTF8Encoding($false))
    )
    Write-Host "Wrote $RelativePath" -ForegroundColor Green
}

function Replace-RegexOnce(
    [string]$Content,
    [string]$Pattern,
    [string]$Replacement,
    [string]$Description
) {
    $regex = [regex]::new(
        $Pattern,
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    $matches = $regex.Matches($Content)

    if ($matches.Count -ne 1) {
        throw "Patch '$Description' expected exactly 1 match, found $($matches.Count)."
    }

    return $regex.Replace($Content, $Replacement, 1)
}

Write-Host ""
Write-Host "Nairobi Club Committee Register - Stage 4 lint cleanup" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"
Write-Host ""

# 1. Remove stale duplicate Stage 4 component.
$oldCoi = FullPath "src/components/MeetingCOIPanel.tsx"
if (Test-Path -LiteralPath $oldCoi) {
    Remove-Item -LiteralPath $oldCoi -Force
    Write-Host "Removed stale src/components/MeetingCOIPanel.tsx" -ForegroundColor Green
}

# 2. Fix ConflictOfInterestPanel effect to perform async work inside the effect callbacks.
$coiPath = FullPath "src/components/ConflictOfInterestPanel.tsx"
if (-not (Test-Path -LiteralPath $coiPath)) {
    throw "Missing src/components/ConflictOfInterestPanel.tsx"
}

$coi = Get-Content -LiteralPath $coiPath -Raw

$oldEffectPattern = @'
(?s)  const load = useCallback\(async \(\) => \{.*?\}, \[meetingId\]\);\s*
\s*useEffect\(\(\) => \{\s*
\s*void load\(\);\s*
\s*\}, \[load\]\);
'@

$newEffect = @'
  const load = useCallback(async () => {
    const response =
      await request<CoiResponse>(
        `/api/meetings/${encodeURIComponent(meetingId)}/coi`,
      );

    setData(response);
    setErrorMessage("");
    setInitialLoading(false);
  }, [meetingId]);

  useEffect(() => {
    let cancelled = false;

    void request<CoiResponse>(
      `/api/meetings/${encodeURIComponent(meetingId)}/coi`,
    )
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setErrorMessage("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load conflict-of-interest declarations.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setInitialLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [meetingId]);
'@

$coi = Replace-RegexOnce `
    $coi `
    $oldEffectPattern `
    $newEffect `
    "replace COI loading effect"

Write-Utf8NoBom "src/components/ConflictOfInterestPanel.tsx" $coi

# 3. Normalize irregular Unicode whitespace in App.tsx only.
$appPath = FullPath "src/App.tsx"
if (-not (Test-Path -LiteralPath $appPath)) {
    throw "Missing src/App.tsx"
}

$app = Get-Content -LiteralPath $appPath -Raw

$irregularWhitespace = @(
    [char]0x00A0, # no-break space
    [char]0x1680,
    [char]0x2000,
    [char]0x2001,
    [char]0x2002,
    [char]0x2003,
    [char]0x2004,
    [char]0x2005,
    [char]0x2006,
    [char]0x2007,
    [char]0x2008,
    [char]0x2009,
    [char]0x200A,
    [char]0x202F,
    [char]0x205F,
    [char]0x3000
)

foreach ($char in $irregularWhitespace) {
    $app = $app.Replace([string]$char, " ")
}

# 4. Convert AttendancePanel loader to useCallback and make effect dependency correct.
if ($app -notmatch 'const load = useCallback\(async \(\) =>') {
    $app = Replace-RegexOnce `
        $app `
        'async function load\(\) \{\s*await Promise\.resolve\(\);\s*setLoading\(true\);\s*setErrorMessage\(""\);\s*try \{\s*setData\(await apiRequest<AttendanceResponse>\(`\/api\/meetings\/\$\{encodeURIComponent\(meeting\.id\)\}\/attendance`\)\);\s*\}\s*catch \(e\) \{\s*setErrorMessage\(e instanceof Error \? e\.message : "Unable to load attendance\."\);\s*\}\s*finally \{\s*setLoading\(false\);\s*\}\s*\}\s*useEffect\(\(\) => \{\s*void Promise\.resolve\(\)\.then\(\(\) => load\(\)\);\s*\}, \[meeting\.id\]\);' `
        'const load = useCallback(async () => { setLoading(true); setErrorMessage(""); try { setData(await apiRequest<AttendanceResponse>(`/api/meetings/${encodeURIComponent(meeting.id)}/attendance`)); } catch (e) { setErrorMessage(e instanceof Error ? e.message : "Unable to load attendance."); } finally { setLoading(false); } }, [meeting.id]); useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);' `
        "fix AttendancePanel hook dependencies"
}

# 5. Convert top-level loadData to useCallback and make effect dependency correct.
if ($app -notmatch 'const loadData = useCallback\(async \(\) =>') {
    $app = Replace-RegexOnce `
        $app `
        'async function loadData\(\) \{\s*if \(!user\) return;\s*await Promise\.resolve\(\);\s*setLoadingData\(true\);(.*?)\}\s*useEffect\(\(\) => \{\s*if \(user\) void Promise\.resolve\(\)\.then\(\(\) => loadData\(\)\);\s*\}, \[user\]\);' `
        'const loadData = useCallback(async () => { if (!user) return; setLoadingData(true);$1}, [user]); useEffect(() => { if (user) void Promise.resolve().then(() => loadData()); }, [user, loadData]);' `
        "fix AuthenticatedApp hook dependencies"
}

# Ensure import has useCallback.
if ($app -notmatch '\buseCallback\b') {
    throw "App.tsx patch expected useCallback usage but none was found."
}

$app = $app.Replace(
    'import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";',
    'import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";'
)

Write-Utf8NoBom "src/App.tsx" $app

# 6. Validation
Push-Location $RepoRoot
try {
    Write-Host ""
    Write-Host "Running lint..." -ForegroundColor Cyan
    & npm run lint
    if ($LASTEXITCODE -ne 0) {
        throw "Lint still failed."
    }

    Write-Host ""
    Write-Host "Running typecheck..." -ForegroundColor Cyan
    & npm run typecheck
    if ($LASTEXITCODE -ne 0) {
        throw "Typecheck failed."
    }

    Write-Host ""
    Write-Host "Running production build..." -ForegroundColor Cyan
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed."
    }

    Write-Host ""
    Write-Host "Stage 4 code is lint-clean, type-safe and production-build clean." -ForegroundColor Green
    Write-Host "No database migration was executed." -ForegroundColor Yellow
}
finally {
    Pop-Location
}

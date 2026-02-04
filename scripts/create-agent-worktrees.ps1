$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$defaultAgents = @("web", "api", "android", "shared", "docs")

$agents = $args
if ($agents.Count -eq 0) {
    $agents = $defaultAgents
}

$worktreesRoot = Join-Path $repoRoot ".worktrees"
if (-not (Test-Path $worktreesRoot)) {
    New-Item -ItemType Directory -Path $worktreesRoot | Out-Null
}

Push-Location $repoRoot
try {
    foreach ($agent in $agents) {
        $agentName = $agent.Trim()
        if ([string]::IsNullOrWhiteSpace($agentName)) {
            continue
        }

        $branchName = "agent/$agentName"
        $worktreePath = Join-Path $worktreesRoot $agentName

        if (Test-Path $worktreePath) {
            Write-Host "Worktree exists for $agentName at $worktreePath"
            continue
        }

        git show-ref --verify --quiet "refs/heads/$branchName"
        if ($LASTEXITCODE -ne 0) {
            git branch $branchName
        }

        git worktree add $worktreePath $branchName
        Write-Host "Created worktree for $agentName at $worktreePath"
    }
}
finally {
    Pop-Location
}

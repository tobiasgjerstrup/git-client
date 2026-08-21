param(
    [string]$LockFile = ".\package-lock.json",
    [string]$AllowlistFile = ".\allowlist.yaml"
)

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# Validate package-lock.json
# ------------------------------------------------------------

if (-not (Test-Path -LiteralPath $LockFile)) {
    throw "package-lock.json not found: $LockFile"
}

$LockFile = (Resolve-Path -LiteralPath $LockFile).Path

Write-Host "Reading package lock:"
Write-Host "  $LockFile"
Write-Host ""

# ------------------------------------------------------------
# Create a temporary Node.js helper.
# ------------------------------------------------------------

$tempJs = Join-Path $env:TEMP "generate-allowlist-$PID.js"

@'
const fs = require('fs');

const file = process.argv[2];

const lock = JSON.parse(
    fs.readFileSync(file, 'utf8')
);

const packages = lock.packages || {};

for (const [path, entry] of Object.entries(packages)) {

    // Empty path is the root project.
    if (!path) {
        continue;
    }

    if (!entry || !entry.version) {
        continue;
    }

    const marker = 'node_modules/';

    if (!path.includes(marker)) {
        continue;
    }

    // Use the package after the final node_modules/.
    const index = path.lastIndexOf(marker);
    const name = path.substring(index + marker.length);

    if (!name) {
        continue;
    }

    console.log(name + '\t' + entry.version);
}
'@ | Set-Content -LiteralPath $tempJs -Encoding UTF8

try {

    # --------------------------------------------------------
    # Parse package-lock.json using Node.
    # --------------------------------------------------------

    $lockEntries = & node $tempJs $LockFile

    if ($LASTEXITCODE -ne 0) {
        throw "Node.js failed to parse $LockFile"
    }

}
finally {

    # Always remove temporary JS file.
    Remove-Item -LiteralPath $tempJs -Force -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------
# Build package -> exact versions map
# ------------------------------------------------------------

$packages = @{}

foreach ($line in $lockEntries) {

    if ([string]::IsNullOrWhiteSpace($line)) {
        continue
    }

    $parts = $line -split "`t", 2

    if ($parts.Count -ne 2) {
        continue
    }

    $name = $parts[0].Trim()
    $version = $parts[1].Trim()

    if ([string]::IsNullOrWhiteSpace($name)) {
        continue
    }

    if ([string]::IsNullOrWhiteSpace($version)) {
        continue
    }

    if (-not $packages.ContainsKey($name)) {
        $packages[$name] =
            [System.Collections.Generic.HashSet[string]]::new()
    }

    [void]$packages[$name].Add($version)
}

if ($packages.Count -eq 0) {
    throw "No packages were found in $LockFile"
}

Write-Host "Found $($packages.Count) packages in package-lock.json."
Write-Host ""

# ------------------------------------------------------------
# Read existing allowlist.yaml
# ------------------------------------------------------------

$existing = @{}

if (Test-Path -LiteralPath $AllowlistFile) {

    Write-Host "Reading existing allowlist:"
    Write-Host "  $AllowlistFile"
    Write-Host ""

    $currentPackage = $null

    foreach ($line in Get-Content -LiteralPath $AllowlistFile) {

        # Package name:
        #
        # foo:
        # "@types/node":
        #

        if ($line -match '^(?:"([^"]+)"|([^:#]+)):\s*$') {

            if ($matches[1]) {
                $currentPackage = $matches[1]
            }
            else {
                $currentPackage = $matches[2].Trim()
            }

            if (-not $existing.ContainsKey($currentPackage)) {
                $existing[$currentPackage] =
                    [System.Collections.Generic.HashSet[string]]::new()
            }

            continue
        }

        # Version:
        #
        #   - 1.2.3
        #

        if ($null -ne $currentPackage -and
            $line -match '^\s+-\s+(.+?)\s*$') {

            $version = $matches[1].Trim()

            if ($version) {
                [void]$existing[$currentPackage].Add($version)
            }
        }
    }
}

# ------------------------------------------------------------
# Merge package-lock into allowlist
# ------------------------------------------------------------

$addedPackages = 0
$addedVersions = 0

foreach ($name in $packages.Keys) {

    if (-not $existing.ContainsKey($name)) {

        $existing[$name] =
            [System.Collections.Generic.HashSet[string]]::new()

        $addedPackages++
    }

    foreach ($version in $packages[$name]) {

        if ($existing[$name].Add($version)) {
            $addedVersions++
        }
    }
}

# ------------------------------------------------------------
# Create destination directory if necessary
# ------------------------------------------------------------

$allowlistDirectory = Split-Path -Parent $AllowlistFile

if ($allowlistDirectory -and
    -not (Test-Path -LiteralPath $allowlistDirectory)) {

    New-Item `
        -ItemType Directory `
        -Path $allowlistDirectory `
        -Force |
        Out-Null
}

# ------------------------------------------------------------
# Write YAML
# ------------------------------------------------------------

$output = [System.Collections.Generic.List[string]]::new()

foreach ($name in ($existing.Keys | Sort-Object)) {

    # Quote scoped npm packages.
    if ($name.Length -gt 0 -and $name[0] -eq '@') {
        $yamlName = '"' + $name + '"'
    }
    else {
        $yamlName = $name
    }

    $output.Add("${yamlName}:")

    foreach ($version in ($existing[$name] | Sort-Object)) {
        $output.Add("  - $version")
    }

    $output.Add("")
}

$output |
    Set-Content `
        -LiteralPath $AllowlistFile `
        -Encoding UTF8

# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------

$totalVersions = 0

foreach ($name in $existing.Keys) {
    $totalVersions += $existing[$name].Count
}

Write-Host "Allowlist updated successfully."
Write-Host ""
Write-Host "File:"
Write-Host "  $AllowlistFile"
Write-Host ""
Write-Host "Packages:"
Write-Host "  $($existing.Count)"
Write-Host ""
Write-Host "Exact package versions:"
Write-Host "  $totalVersions"
Write-Host ""
Write-Host "New packages added:"
Write-Host "  $addedPackages"
Write-Host ""
Write-Host "New package versions added:"
Write-Host "  $addedVersions"

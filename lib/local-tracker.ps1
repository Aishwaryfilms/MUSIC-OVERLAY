[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' 
})[0]

function AwaitTask($WinRtTask, $ResultType) {
    if (-not $WinRtTask) { return $null }
    try {
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $netTask = $asTask.Invoke($null, @($WinRtTask))
        $netTask.Wait(2000) | Out-Null
        return $netTask.Result
    } catch {
        return $null
    }
}

$asStreamMethod = ([System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { 
    $_.Name -eq 'AsStream' -and $_.GetParameters().Count -eq 1 
})[0]

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType=WindowsRuntime] | Out-Null

$lastTitle = ""
$lastArtist = ""
$lastStatus = ""
$lastArtBase64 = ""

function DetectPlatform($appId, $title, $artist) {
    $str = "$appId $title $artist".ToLower()
    if ($appId -like "*Spotify*") {
        return @{ id = "spotify"; name = "Spotify"; brandColor = "#1db954" }
    }
    if ($appId -like "*AppleMusic*" -or $appId -like "*iTunes*" -or $appId -like "*Apple.Music*") {
        return @{ id = "applemusic"; name = "Apple Music"; brandColor = "#fa243c" }
    }
    if ($appId -like "*AmazonMusic*" -or $appId -like "*Amazon.Music*") {
        return @{ id = "amazonmusic"; name = "Amazon Music"; brandColor = "#00a8e1" }
    }
    if ($str -like "*youtube music*" -or $str -like "*music.youtube.com*" -or $appId -like "*YouTubeMusic*") {
        return @{ id = "youtubemusic"; name = "YouTube Music"; brandColor = "#ff0000" }
    }
    if ($appId -like "*Chrome*" -or $appId -like "*msedge*" -or $appId -like "*Brave*") {
        if ($str -like "*youtube*" -or $str -like "*music*") {
            return @{ id = "youtubemusic"; name = "YouTube Music"; brandColor = "#ff0000" }
        }
        return @{ id = "web"; name = "Browser Audio"; brandColor = "#3b82f6" }
    }
    return @{ id = "media"; name = "Desktop Player"; brandColor = "#a1a1aa" }
}

function MatchFilter($session, $filter) {
    if (-not $session -or -not $filter -or $filter -eq "auto") { return $true }
    $appId = if ($session.SourceAppUserModelId) { $session.SourceAppUserModelId } else { "" }
    if ($filter -eq "spotify") {
        return ($appId -like "*Spotify*")
    }
    if ($filter -eq "applemusic") {
        return ($appId -like "*AppleMusic*" -or $appId -like "*iTunes*" -or $appId -like "*Apple.Music*")
    }
    if ($filter -eq "youtubemusic") {
        if ($appId -like "*YouTubeMusic*") { return $true }
        if ($appId -like "*Chrome*" -or $appId -like "*msedge*" -or $appId -like "*Brave*" -or $appId -like "*Firefox*") {
            try {
                $m = AwaitTask ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
                if ($m) {
                    $combo = "$($m.Title) $($m.Artist)".ToLower()
                    if ($combo -like "*youtube*") { return $true }
                }
            } catch {}
            return $true
        }
        return $false
    }
    return $true
}

while ($true) {
    try {
        # Read current audio source filter from settings.json
        $filter = "auto"
        $settingsPath = Join-Path $PSScriptRoot "..\settings.json"
        if (Test-Path $settingsPath) {
            try {
                $raw = Get-Content $settingsPath -Raw -ErrorAction SilentlyContinue
                if ($raw) {
                    $json = $raw | ConvertFrom-Json
                    if ($json.audioSource) {
                        $filter = $json.audioSource.ToLower()
                    }
                }
            } catch {}
        }

        $managerOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
        $manager = AwaitTask $managerOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

        $targetSession = $null
        if ($manager) {
            $sessions = $manager.GetSessions()
            
            # 1. Prefer any session that is actively PLAYING and matches filter
            foreach ($s in $sessions) {
                if (MatchFilter $s $filter) {
                    $pb = $s.GetPlaybackInfo()
                    if ($pb -and $pb.PlaybackStatus.ToString() -eq "Playing") {
                        $targetSession = $s
                        break
                    }
                }
            }

            # 2. If none playing, pick any session that matches filter
            if (-not $targetSession) {
                foreach ($s in $sessions) {
                    if (MatchFilter $s $filter) {
                        $targetSession = $s
                        break
                    }
                }
            }

            # 3. Fallback to OS current session only if filter is auto
            if (-not $targetSession -and $filter -eq "auto") {
                $targetSession = $manager.GetCurrentSession()
            }
        }

        # If specific source filter is active but no matching session exists
        if (-not $targetSession -and $filter -ne "auto") {
            $nameMap = @{ "spotify" = "Spotify"; "applemusic" = "Apple Music"; "youtubemusic" = "YouTube Music" }
            $colorMap = @{ "spotify" = "#1db954"; "applemusic" = "#fa243c"; "youtubemusic" = "#ff0000" }
            $dispName = if ($nameMap.ContainsKey($filter)) { $nameMap[$filter] } else { $filter }
            $dispColor = if ($colorMap.ContainsKey($filter)) { $colorMap[$filter] } else { "#1db954" }

            $obj = @{
                type = "track_update"
                source = "local"
                app = $filter
                platform = $filter
                platformName = $dispName
                brandColor = $dispColor
                title = "Waiting for $dispName..."
                artist = "No active $dispName playback"
                album = ""
                status = "Idle"
                isPlaying = $false
                position = 0
                duration = 0
                hasArt = $false
                artBase64 = ""
            }
            [Console]::WriteLine(($obj | ConvertTo-Json -Compress))
            Start-Sleep -Milliseconds 600
            continue
        }

        if ($targetSession) {
            $mediaOp = $targetSession.TryGetMediaPropertiesAsync()
            $media = AwaitTask $mediaOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
            
            $playbackInfo = $targetSession.GetPlaybackInfo()
            $timeline = $targetSession.GetTimelineProperties()

            $title = if ($media) { $media.Title } else { "" }
            $artist = if ($media) { $media.Artist } else { "" }
            $album = if ($media) { $media.AlbumTitle } else { "" }

            # Clean browser titles if artist is blank (e.g. YouTube Music / Browser tabs)
            if ([string]::IsNullOrEmpty($artist) -and $title -match '^(.*?)\s*[-–—]\s*(.*)$') {
                $p1 = $matches[1].Trim()
                $p2 = $matches[2].Trim()
                $p2 = $p2 -replace '(?i)\s*[-–—]\s*YouTube.*$', ''
                $title = $p1
                $artist = $p2
            }
            $title = $title -replace '(?i)\s*[-–—]\s*YouTube.*$', ''

            $status = if ($playbackInfo) { $playbackInfo.PlaybackStatus.ToString() } else { "Closed" }
            $isPlaying = ($status -eq "Playing")

            $pos = 0
            $dur = 0
            if ($timeline) {
                $pos = [Math]::Round($timeline.Position.TotalSeconds, 2)
                $dur = [Math]::Round($timeline.EndTime.TotalSeconds, 2)
            }

            $platform = DetectPlatform $targetSession.SourceAppUserModelId $title $artist

            # If track changed, reload thumbnail
            $artChanged = $false
            if (($title -ne $lastTitle -or $artist -ne $lastArtist) -and $media -and $media.Thumbnail) {
                try {
                    $thumbStreamOp = $media.Thumbnail.OpenReadAsync()
                    $thumbStream = AwaitTask $thumbStreamOp ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                    if ($thumbStream) {
                        $netStream = $asStreamMethod.Invoke($null, @($thumbStream))
                        $memStream = New-Object System.IO.MemoryStream
                        $netStream.CopyTo($memStream)
                        $bytes = $memStream.ToArray()
                        if ($bytes.Length -gt 0) {
                            $lastArtBase64 = [Convert]::ToBase64String($bytes)
                            $artChanged = $true
                        }
                    }
                } catch {
                    # Ignore thumbnail extraction error
                }
            }

            $lastTitle = $title
            $lastArtist = $artist
            $lastStatus = $status

            $obj = @{
                type = "track_update"
                source = "local"
                app = $targetSession.SourceAppUserModelId
                platform = $platform.id
                platformName = $platform.name
                brandColor = $platform.brandColor
                title = $title
                artist = $artist
                album = $album
                status = $status
                isPlaying = $isPlaying
                position = $pos
                duration = $dur
                artBase64 = if ($artChanged -or $lastArtBase64) { $lastArtBase64 } else { $null }
                hasArt = (-not [string]::IsNullOrEmpty($lastArtBase64))
            }

            $json = $obj | ConvertTo-Json -Compress
            Write-Output $json
            [Console]::Out.Flush()
        } else {
            if ($lastStatus -ne "Idle") {
                $lastStatus = "Idle"
                $obj = @{
                    type = "track_update"
                    source = "local"
                    status = "Idle"
                    isPlaying = $false
                    title = ""
                    artist = ""
                    album = ""
                    position = 0
                    duration = 0
                    hasArt = $false
                    platform = "unknown"
                    platformName = "Music"
                }
                Write-Output ($obj | ConvertTo-Json -Compress)
                [Console]::Out.Flush()
            }
        }
    } catch {
        # Silent retry
    }

    Start-Sleep -Milliseconds 800
}

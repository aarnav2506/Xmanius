$models = @("xmanius-1", "xmanius-2", "xmanius-3", "xmanius-4")
foreach ($m in $models) {
    Write-Host "`n=================================="
    Write-Host "Testing model: $m"
    try {
        $req = [System.Net.HttpWebRequest]::Create("https://xmanius.vercel.app/api/xmanius-chat")
        $req.Method = "POST"
        $req.ContentType = "application/json"
        $req.Timeout = 10000
        $payload = '{"message":"hi","model":"' + $m + '"}'
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $req.ContentLength = $bytes.Length
        $stream = $req.GetRequestStream()
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Close()
        $resp = $req.GetResponse()
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
        Write-Host "SUCCESS: " $resp.StatusCode
        Write-Host "BODY: " $sr.ReadToEnd().Substring(0, [Math]::Min(200, $sr.ReadToEnd().Length))
    } catch [System.Net.WebException] {
        Write-Host "STATUS: " $_.Exception.Response.StatusCode
        if ($_.Exception.Response) {
            $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Host "BODY: " $sr.ReadToEnd()
        }
    }
}

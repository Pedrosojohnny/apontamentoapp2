# script para iniciar a aplicação e o túnel de teste automaticamente

# 1. Limpar processos antigos do Python para evitar erro de porta em uso
Write-Host "Limpando processos anteriores do Python..." -ForegroundColor Yellow
Get-Process -Name "python" -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. Iniciar o servidor Flask em segundo plano
Write-Host "Iniciando servidor Flask local..." -ForegroundColor Cyan
Start-Job -Name "FlaskServer" -ScriptBlock {
    python c:\PROJETOS\apontamento-vs\app.py
} | Out-Null

# 3. Aguardar o servidor inicializar
Start-Sleep -Seconds 2

# 4. Iniciar o túnel SSH do Serveo
Write-Host "Iniciando o túnel para o celular..." -ForegroundColor Green
Write-Host "O link gerado (começando com https://...) aparecerá abaixo." -ForegroundColor Green
Write-Host "Pressione Ctrl+C para encerrar o teste e o servidor." -ForegroundColor Yellow
Write-Host "--------------------------------------------------------"

ssh -o StrictHostKeyChecking=no -R 80:127.0.0.1:5000 serveo.net

# 5. Ao encerrar o túnel (Ctrl+C), parar o Flask que ficou em background
Write-Host "`nFinalizando servidor Flask..." -ForegroundColor Yellow
Stop-Job -Name "FlaskServer" -ErrorAction SilentlyContinue
Remove-Job -Name "FlaskServer" -ErrorAction SilentlyContinue
Write-Host "Teste finalizado com sucesso!" -ForegroundColor Green

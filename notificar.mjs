// Notificação do Windows (toast) por PowerShell, sem instalar nada. Falha em silêncio.
// Os textos vão por variáveis de ambiente e entram no XML por InnerText: o título vem do cartão e não é confiável.
import { spawn } from 'node:child_process';

const SCRIPT = `
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$t = $xml.GetElementsByTagName('text')
$t.Item(0).InnerText = $env:PLAN_TITULO
$t.Item(1).InnerText = $env:PLAN_TEXTO
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
`;

export function notificarWindows({ titulo, texto }) {
  try {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')],
      { windowsHide: true, stdio: 'ignore', env: { ...process.env, PLAN_TITULO: String(titulo ?? ''), PLAN_TEXTO: String(texto ?? '') } });
    p.on('error', () => {});
  } catch { /* sem notificação não é erro */ }
}

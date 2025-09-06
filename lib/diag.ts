// lib/diag.ts
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

/** 失敗時のメッセージ整形 */
const msg = (e: any) => e?.message || e?.error_description || JSON.stringify(e);

/**
 * Supabase 到達テストをまとめて実行
 * - DB REST 到達
 * - Storage LIST（一覧）
 * - Storage 署名付きURL → PUT（x-upsert 付与）→ 公開URL取得
 * @returns ログ文字列（Alertやconsole.logで表示してOK）
 */
export async function runSupabaseDiag(bucket = 'posts'): Promise<string> {
  const lines: string[] = [];

  // 1) DB REST
  try {
    await supabase.from('posts').select('id').limit(1);
    lines.push('DB REST ✅');
  } catch (e) {
    lines.push('DB REST ❌ ' + msg(e));
  }

  // 2) Storage LIST
  try {
    const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1 });
    if (error) throw error;
    lines.push(`Storage LIST ✅ (items: ${data?.length ?? 0})`);
  } catch (e) {
    lines.push('Storage LIST ❌ ' + msg(e));
  }

  // 3) 署名付きURL → PUT（テキスト1行をアップ）
  try {
    const tmp = FileSystem.cacheDirectory + `ping-${Date.now()}.txt`;
    await FileSystem.writeAsStringAsync(tmp, 'hello', { encoding: FileSystem.EncodingType.UTF8 });

    const path = `debug/ping-${Date.now()}.txt`;
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
    if (error) throw error;

    const put = await FileSystem.uploadAsync(data.signedUrl, tmp, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': 'text/plain', 'x-upsert': 'true' }, // ←重要
    });

    lines.push(`Signed PUT ✅ (status: ${put.status})`);

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    lines.push(`Public URL ✅ ${pub.publicUrl}`);

    // 後片付け（不要な一時ファイル削除）
    try { await FileSystem.deleteAsync(tmp, { idempotent: true }); } catch {}
  } catch (e) {
    lines.push('Signed PUT ❌ ' + msg(e));
  }

  return lines.join('\n');
}

// lib/storage.ts
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { supabase } from './supabase';

const BUCKET_AVATARS = 'avatars';

function base64ToBytes(b64: string) {
  const bin = atob(b64);                 // ← polyfill
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function uploadAvatarIfLocal(uri: string | null): Promise<string | null> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  console.log('[diag] session?', !!s.session?.access_token, 'uid=', uid);
  console.log('[diag] bucket=', BUCKET_AVATARS);

  if (!uri) return null;
  if (!uid) { Alert.alert('エラー', 'ログイン状態を確認してください。'); return null; }

  // 既にURLならそのまま
  if (uri.startsWith('http')) return uri;

  // iOSの ph:// 対策：必ず file:// を読む。picker後に manipulator を通していれば既に file:// です
  let local = uri.replace('ph://', 'file://');

  // FileSystem で base64 読み＆バイト配列化（fetch(blob)より確実）
  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(local, { encoding: FileSystem.EncodingType.Base64 });
  } catch (e) {
    // 一部環境で file:// でも読めないことがある → 一時コピーして再読込
    const tmp = `${FileSystem.cacheDirectory}avatar-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: local, to: tmp });
    base64 = await FileSystem.readAsStringAsync(tmp, { encoding: FileSystem.EncodingType.Base64 });
    local = tmp;
  }
  const bytes = base64ToBytes(base64);

  const fileName = `${uid}/avatar-${Date.now()}.jpg`;
  console.log('[diag] upload to', BUCKET_AVATARS, 'name=', fileName, 'size=', bytes.byteLength);

  const { error } = await supabase.storage
    .from(BUCKET_AVATARS)
    .upload(fileName, bytes, { contentType: 'image/jpeg', upsert: true });

  if (error) {
    console.log('[diag] storage error:', error.message);
    Alert.alert('アップロード失敗', error.message);
    return null;
  }

  const { data: pub } = supabase.storage.from(BUCKET_AVATARS).getPublicUrl(fileName);
  const url = pub?.publicUrl ?? null;
  console.log('[diag] avatar publicUrl =', url);
  return url;
}

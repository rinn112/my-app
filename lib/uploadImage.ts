// lib/uploadImage.ts
import { decode as base64Decode } from 'base-64';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

type UploadOpts = {
  uri: string; key: string; bucket: string;
  contentType?: string; ext?: 'jpg' | 'png' | 'webp';
};

export async function uploadImageFromUri(
  opts: UploadOpts
): Promise<{ path: string; publicUrl: string }> {
  const { uri, key, bucket, contentType = 'image/jpeg', ext = 'jpg' } = opts;
  const path = `${key}.${ext}`;

  let localUri = uri, temp = false;
  if (!/^file:\/\//i.test(uri)) {
    const target = FileSystem.cacheDirectory + `upload-${Date.now()}.${ext}`;
    const dl = await FileSystem.downloadAsync(uri, target);
    localUri = dl.uri; temp = true;
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToUint8Array(base64);

  const { data, error } = await supabase.storage.from(bucket)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`storage.upload: ${error.message}`);

  if (temp) { try { await FileSystem.deleteAsync(localUri, { idempotent: true }); } catch {} }

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path: data?.path ?? path, publicUrl: pub.publicUrl };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = base64Decode(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

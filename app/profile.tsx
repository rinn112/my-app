// app/profile.tsx
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, SafeAreaView,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { uploadAvatarIfLocal } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { theme } from '../styles/theme';

type Profile = { username: string | null; avatar_url: string | null };

export default function EditProfile() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [icon, setIcon] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id ?? null;
    setUid(id);
    if (id) {
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', id)
        .maybeSingle();
      setUsername(data?.username ?? '');
      setIcon(data?.avatar_url ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickImage = async () => {
    try {
      const mediaTypeImages =
        (ImagePicker as any).MediaType?.Images ??
        (ImagePicker as any).MediaTypeOptions?.Images ?? 'images';

      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaTypeImages as any,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (r.canceled) return;

      // 512px に縮小し JPEG 85% に圧縮
      const src = r.assets[0].uri;
      const { uri: resized } = await ImageManipulator.manipulateAsync(
        src,
        [{ resize: { width: 512 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      setIcon(resized);
    } catch {
      Alert.alert('エラー', '画像の選択に失敗しました。');
    }
  };

  const onSave = async () => {
    if (!uid) return Alert.alert('エラー', 'ログイン状態を確認してください。');
    if (!username.trim()) return Alert.alert('確認', 'ユーザー名を入力してください。');

    try {
      setLoading(true);

      // 画像をアップロードして公開URL（または署名URL）を取得
      const avatarUrl = await uploadAvatarIfLocal(icon);
      console.log('[diag] avatar url =', avatarUrl);

      // 保存しつつ保存後の値を取得
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: uid,
          username: username.trim(),
          avatar_url: avatarUrl,
        })
        .select('id, username, avatar_url')
        .single();

      if (error) throw error;
      console.log('[diag] saved avatar_url =', data?.avatar_url);

      router.back();
    } catch (e: any) {
      Alert.alert('保存に失敗', e?.message ?? '不明なエラーです');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={[s.wrap, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.wrap}>
        <Text style={s.title}>プロフィール編集</Text>

        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          {icon ? <Image key={icon} source={{ uri: icon }} style={s.icon} /> : <View style={[s.icon, s.iconPh]} />}
        </View>

        <TouchableOpacity style={s.btnOutline} onPress={pickImage}>
          <Text style={s.btnOutlineT}>アイコンを選択</Text>
        </TouchableOpacity>

        <TextInput
          style={s.inp}
          placeholder="ユーザー名"
          placeholderTextColor={theme.colors.muted}
          value={username}
          onChangeText={setUsername}
        />

        <TouchableOpacity style={s.btnPrimary} onPress={onSave}>
          <Text style={s.btnPrimaryT}>保存</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.linkGray}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 12, backgroundColor: theme.colors.bg },
  title: { fontSize: 22, color: theme.colors.text, marginBottom: 16, fontWeight: '400' },
  inp: {
    backgroundColor: theme.colors.card, borderRadius: theme.radius, padding: 14,
    marginTop: 12, borderWidth: 0, ...theme.shadow,
  },
  icon: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff' },
  iconPh: { borderWidth: 2, borderColor: theme.colors.border, backgroundColor: '#fff' },
  btnPrimary: {
    backgroundColor: theme.colors.primary, padding: 14, borderRadius: theme.radius,
    alignItems: 'center', marginTop: 16,
  },
  btnPrimaryT: { color: '#fff', fontWeight: '800' },
  btnOutline: {
    backgroundColor: theme.colors.card, borderWidth: 2, borderColor: theme.colors.primary,
    padding: 12, borderRadius: theme.radius, alignItems: 'center', marginBottom: 8, ...theme.shadow,
  },
  btnOutlineT: { color: theme.colors.primary, fontWeight: '800' },
  linkGray: { marginTop: 14, color: theme.colors.muted, fontWeight: '400', textAlign: 'center' },
});

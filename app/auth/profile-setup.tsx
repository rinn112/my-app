// app/auth/profile-setup.tsx
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert, Image,
  SafeAreaView,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { uploadAvatarIfLocal } from '../../lib/storage'; // ★ 共通関数
import { supabase } from '../../lib/supabase';
import { theme } from '../../styles/theme';

export default function ProfileSetup() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    (async () => {
      setAsking(true);
      try { await ImagePicker.requestMediaLibraryPermissionsAsync(); }
      finally { setAsking(false); }
    })();
  }, []);

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

    // 512px + JPEG 85% に縮小圧縮（通信量↓／成功率↑）
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
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return Alert.alert('エラー', 'ログイン状態を確認してください。');
    if (!username.trim()) return Alert.alert('確認', 'ユーザー名を入力してください。');

    const avatarUrl = await uploadAvatarIfLocal(icon); // ★ アップロード & 公開URL取得
    const { error } = await supabase.from('profiles').upsert({
      id: uid,
      username: username.trim(),
      avatar_url: avatarUrl,
    });

    if (error) Alert.alert('保存に失敗', error.message);
    else router.replace('/');
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.wrap}>
        <Text style={s.title}>プロフィール設定</Text>

        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          {icon ? <Image source={{ uri: icon }} style={s.icon} /> : <View style={[s.icon, s.iconPh]} />}
        </View>

        <TouchableOpacity
          style={[s.btnOutline, asking && { opacity: 0.6 }]}
          onPress={pickImage}
          disabled={asking}
        >
          <Text style={s.btnOutlineT}>{asking ? '権限確認中…' : 'アイコンを選択'}</Text>
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
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 12, backgroundColor: theme.colors.bg },
  title: { fontSize: 22, color: theme.colors.text, marginBottom: 16, fontWeight: '400' }, // 太字にしない
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
});

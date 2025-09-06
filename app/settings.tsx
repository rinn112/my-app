// app/settings.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function SettingsScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>設定</Text>
      <Text>通知・位置情報などの設定をここに追加します。</Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FDECF2' },
  title: { fontSize: 22, fontWeight: '800', color: '#FF2EDA', marginBottom: 10 },
});

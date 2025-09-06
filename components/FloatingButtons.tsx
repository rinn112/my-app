// components/FloatingButtons.tsx
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PINK = '#E5C2FF';
const HOTPINK = '#FF6EF5';

type Props = {
  onPressCreate: () => void;  // 例) router.push('/camera') or router.push('/post')
  onPressHome: () => void;    // 例) router.replace('/index')
};

export default function FloatingButtons({ onPressCreate, onPressHome }: Props) {
  return (
    // 親はタッチを奪わない。子はタッチ可能
    <View pointerEvents="box-none" style={styles.wrap}>
      {/* 下のピンク帯（必要なければ消してOK） */}
      <View style={styles.bottomBar} />

      {/* 中央の＋（最前面） */}
      <TouchableOpacity style={styles.fab} onPress={onPressCreate} activeOpacity={0.9}>
        <Text style={styles.plus}>＋</Text>
      </TouchableOpacity>

      {/* 右下のHome */}
      <TouchableOpacity style={styles.home} onPress={onPressHome} activeOpacity={0.8}>
        <Ionicons name="home-outline" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    // FeedSheet(zIndex:10) より前面に
    zIndex: 30, elevation: 30,
  },
  bottomBar: {
    height: 64, backgroundColor: PINK, borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  fab: {
    position: 'absolute', left: '50%', transform: [{ translateX: -32 }],
    bottom: 32, width: 64, height: 64, borderRadius: 32,
    backgroundColor: HOTPINK, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8,
    ...Platform.select({ android: { elevation: 12 } }),
  },
  plus: { color: '#fff', fontSize: 36, lineHeight: 40, fontWeight: '800' },
  home: {
    position: 'absolute', right: 18, bottom: 18,
    width: 52, height: 52, borderRadius: 16, backgroundColor: HOTPINK,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6,
    ...Platform.select({ android: { elevation: 10 } }),
  },
});

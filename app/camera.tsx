// app/camera.tsx
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// post.tsx と同じフォントを使用
const JP_FONT = 'SawarabiMincho';

// 画面サイズから 4:3 のカメラ矩形を計算
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CAMERA_RATIO = 4 / 3;
const CAMERA_H = Math.min(SCREEN_W * CAMERA_RATIO, SCREEN_H);

// 白帯（上を長め、下を短めに調整）
const TOP_BAND_H = 120;
const BOTTOM_BAND_H = Math.max(SCREEN_H - CAMERA_H - TOP_BAND_H, 0);

export default function CameraScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);

  useEffect(() => {
    (async () => {
      if (!permission?.granted) await requestPermission();
    })();
  }, [permission?.granted]);

  const onSkip = () => router.replace('/post');

  const onShoot = async () => {
    if (!cameraRef.current || taking) return;
    try {
      setTaking(true);
      const photo = await cameraRef.current.takePictureAsync?.({
        quality: 1,
        skipProcessing: Platform.OS === 'android',
      });
      const uri = photo?.uri;
      router.replace({ pathname: '/post', params: { mainImage: uri ?? '' } });
    } catch (e) {
      console.warn('撮影に失敗しました', e);
    } finally {
      setTaking(false);
    }
  };

  if (!permission) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, presentation: 'modal', gestureEnabled: true }} />
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.infoDark}>カメラ権限を確認しています…</Text>
        </View>
      </>
    );
  }

  if (!permission.granted) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, presentation: 'modal', gestureEnabled: true }} />
        <View style={styles.center}>
          <Text style={styles.infoDark}>カメラのアクセス許可が必要です。</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryText}>許可する</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
            <Text style={styles.secondaryText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal', gestureEnabled: true }} />
      <View style={styles.container}>
        {/* 上下：白帯 */}
        <View style={[styles.band, { top: 0, height: TOP_BAND_H }]} pointerEvents="none" />
        <View style={[styles.band, { bottom: 0, height: BOTTOM_BAND_H }]} pointerEvents="none" />

        {/* 中央：4:3 カメラ */}
        <View
          style={{
            position: 'absolute',
            top: TOP_BAND_H,
            left: 0,
            width: SCREEN_W,
            height: CAMERA_H,
            overflow: 'hidden',
            backgroundColor: '#000',
          }}
        >
          <CameraView
            ref={cameraRef}
            style={{ width: '100%', height: '100%' }}
            ratio="4:3"
            facing="back"
            onCameraReady={() => setReady(true)}
          />
        </View>

        {/* 右下：スキップ */}
        <TouchableOpacity style={styles.skipBtn} onPress={onSkip} activeOpacity={0.85}>
          <Text style={styles.skipText}>スキップ</Text>
        </TouchableOpacity>

        {/* 下中央：シャッター（黒ベース） */}
        <TouchableOpacity
          style={[styles.shutterBtn, !ready || taking ? styles.shutterDisabled : null]}
          onPress={onShoot}
          activeOpacity={0.9}
          disabled={!ready || taking}
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
  },

  // 権限UI
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#fff' },
  infoDark: { color: '#222', fontSize: 16, fontFamily: JP_FONT },

  // スキップ（E5C2FF）
  skipBtn: {
    position: 'absolute',
    right: 20,
    bottom: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#E5C2FF',
    borderRadius: 14,
  },
  skipText: { color: '#111', fontSize: 16, fontWeight: '600', fontFamily: JP_FONT },

  // シャッター（黒基調）
  shutterBtn: {
    position: 'absolute',
    bottom: 40,
    left: '50%',
    transform: [{ translateX: -35 }],
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#333',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#555',
  },
  shutterDisabled: { opacity: 0.5 },

  // 権限UIボタン
  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#111',
    borderRadius: 12,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: JP_FONT },
  secondaryBtn: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f2f2f7',
    borderRadius: 10,
  },
  secondaryText: { color: '#111', fontFamily: JP_FONT },
});

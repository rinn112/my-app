function decodeThumUrl(u?:string){try{if(!u)return u as any;const s=String(u);if(s.includes("image.thum.io")&&s.includes("noanimate/")){const tail=s.split("noanimate/")[1]||"";const raw=decodeURIComponent(tail);return "https://image.thum.io/get/width/1200/noanimate/"+raw;}return s;}catch{return u as any;}}
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Image as ExpoImage } from 'expo-image';
import AppText from '../components/AppText';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { uploadImageFromUri } from '../lib/uploadImage';

const PROJECT_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://xqyztcyliqbhpdekmpjx.supabase.co';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// 商品URLプレビューAPI（本番）
const RESOLVE_PRODUCT_URL = 'https://fashion-ai-pd7f25pkb-mayu-shimamuras-projects.vercel.app/api/resolve-product';

// 入力URLを https 化＆/shop/... を zozo.jp に補完
const normalizeUrl = (u: string) => {
  const s = (u || "").trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return `https://zozo.jp${s}`;
  if (/^zozo\.jp/i.test(s)) return `https://${s}`;
  return `https://${s}`;
};

function shot(u:string){ const clean=dedupeUrl(String(u)); return "https://image.thum.io/get/width/1200/noanimate/"+clean; }
function decodeThum(u:string){
  try{
    const s=String(u||'');
    if(s.includes("image.thum.io") && s.includes("noanimate/")){
      const tail=s.split("noanimate/")[1]||"";
      const raw=decodeURIComponent(tail);
      return "https://image.thum.io/get/width/1200/noanimate/" + dedupeUrl(raw);
    }
    return s;
  }catch{ return String(u||''); }
}
 




function dedupeUrl(s:string){
  try{
    const t=String(s).trim();
    return t.replace(/(https?:\/\/[^\s]+?)\1+/,'$1');
  }catch{ return String(s); }
}
// Edge Function 呼び出し（invoke → 直叩きフォールバック）
async function analyzeFashion(imageUrl: string) {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-fashion', {
      body: { image_url: imageUrl, mode: 'hf' },
    });
    if (!error && data) return data;
  } catch {}
  try {
    const r = await fetch(`${PROJECT_URL}/functions/v1/analyze-fashion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON}`,
        'apikey': ANON,
      },
      body: JSON.stringify({ image_url: imageUrl, mode: 'hf' }),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok) return json;
    return { error: json?.error || `HTTP ${r.status}` };
  } catch (e: any) {
    return { error: String(e?.message || e) };
  }
}

type SelectedProduct = {
  url: string;
  title?: string | null;
  image?: string | null;
  price?: string | null;
  source?: string | null;
  fetched_at?: string | null;
};

// ---- 外部/ローカル画像を必ず Supabase Storage に取り込む ----
function guessExtAndType(urlOrPath: string): { ext: 'jpg'|'jpeg'|'png'|'webp', type: string } {
  const u = urlOrPath.split('?')[0].toLowerCase();
  if (u.endsWith('.png'))  return { ext: 'png',  type: 'image/png' };
  if (u.endsWith('.webp')) return { ext: 'webp', type: 'image/webp' };
  if (u.endsWith('.jpeg')) return { ext: 'jpeg', type: 'image/jpeg' };
  return { ext: 'jpg', type: 'image/jpeg' };
}
async function ensureImageInStorage(src: string, uid: string): Promise<string> {
  if (!uid) throw new Error('login required');
  const key = `${uid}/${Date.now()}`;
  if (/^https?:\/\//i.test(src)) {
    const { ext, type } = guessExtAndType(src);
    const { publicUrl } = await uploadImageFromUri({ uri: src, key, bucket: 'posts', contentType: type, ext });
    return publicUrl;
  } else {
    const conv = await ImageManipulator.manipulateAsync(
      src, [{ resize: { width: 900 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    const { publicUrl } = await uploadImageFromUri({
      uri: conv.uri, key, bucket: 'posts', contentType: 'image/jpeg', ext: 'jpg',
    });
    return publicUrl;
  }
}

export default function PostPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mainImage?: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const goBackSafe = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };

  const [mainImage, setMainImage] = useState<string | undefined>(params.mainImage);

  // 商品URL → 全体プレビュー（任意・残しておく）
  const [productUrl, setProductUrl] = useState('');
  const [productPreview, setProductPreview] = useState<SelectedProduct | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // 部位ごとの「入力URL（商品ページ）」と「表示画像URL」
  const [links, setLinks] = useState<Record<'tops'|'bottoms'|'outerwear'|'shoes', string>>({
    tops:'', bottoms:'', outerwear:'', shoes:''
  });
  const [topsUrl, setTopsUrl] = useState('');         // 画像URL（解決結果）
  const [bottomsUrl, setBottomsUrl] = useState('');
  const [outerwearUrl, setOuterwearUrl] = useState('');
  const [shoesUrl, setShoesUrl] = useState('');

  const [editingField, setEditingField] = useState<string | null>(null);

  // 服の雰囲気（5択）
  const categories = ['カジュアル','スマート','フェミニン','モード','アウトドア'] as const;
  const [category, setCategory] = useState<string | null>(null);
  const [autoPicking, setAutoPicking] = useState(false);

  // 位置
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
    })();
  }, []);

  const pickImage = async (setImage: (uri: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  // 単発プレビュー（上の「商品URL（任意）」）
  const fetchProductPreview = async () => {
    if (!productUrl.trim()) { Alert.alert('URLを入力してください'); return; }
    setLoadingPreview(true);
    try {
      const r = await fetch(RESOLVE_PRODUCT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: dedupeUrl(normalizeUrl(productUrl)) }),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
      const prod: any = json.product || {};
if (prod.url) prod.url = dedupeUrl(prod.url);
if (prod.image && String(prod.image).includes("image.thum.io")) {
  const tail = String(prod.image).split("noanimate/")[1]||"";
  try {
    const raw = decodeURIComponent(tail);
    const fixed = dedupeUrl(raw);
    prod.image = "https://image.thum.io/get/width/1200/noanimate/" + fixed;
  } catch {}
} if(!prod.image && prod.url){ prod.image = shot(prod.url); } console.log("[preview]", JSON.stringify(prod).slice(0,200)); console.log("[ui] preview.image =", prod?.image); prod.image = decodeThum(prod.image); prod.image = decodeThumUrl(prod.image); const __img = prod.image || (prod.url ? shot(prod.url) : "");
prod.image = __img.includes("image.thum.io") ? decodeThumUrl(__img) : __img;
console.log("[FINAL IMG]", prod.image);
setProductPreview(prod);
    } catch (e: any) {
      Alert.alert('取得に失敗しました', String(e?.message || e));
      setProductPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  // 各部位の入力URL → 画像URLに解決
  const resolvePart = async (field: 'tops'|'bottoms'|'outerwear'|'shoes') => {
    const raw = links[field];
    if (!raw?.trim()) return;
    try {
      const r = await fetch(RESOLVE_PRODUCT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: dedupeUrl(normalizeUrl(raw)) }),
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);

      const canonical: string = dedupeUrl(json.product?.url || normalizeUrl(raw));
      const image: string = decodeThum(decodeThumUrl(json.product?.image || shot(canonical)));

      switch (field) {
        case 'tops': setTopsUrl(image || ''); break;
        case 'bottoms': setBottomsUrl(image || ''); break;
        case 'outerwear': setOuterwearUrl(image || ''); break;
        case 'shoes': setShoesUrl(image || ''); break;
      }
      setLinks((p) => ({ ...p, [field]: canonical }));
    } catch (e: any) {
      Alert.alert(`${field} の取得に失敗しました`, String(e?.message || e));
    }
  };

  // 自動選択（AI）
  const autoPickCategory = async () => {
    try {
      setAutoPicking(true);
      let targetUrl: string | null = null;
      if (mainImage) {
        if (/^https?:\/\//i.test(mainImage)) targetUrl = mainImage;
        else {
          if (!uid) throw new Error('ログインが必要です');
          const key = `${uid}/tmp/autocls-${Date.now()}`;
          const conv = await ImageManipulator.manipulateAsync(
            mainImage, [{ resize: { width: 600 } }],
            { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
          );
          const { publicUrl } = await uploadImageFromUri({
            uri: conv.uri, key, bucket: 'posts', contentType: 'image/jpeg', ext: 'jpg',
          });
          targetUrl = publicUrl;
        }
      } else if (productPreview?.image) {
        targetUrl = productPreview.image;
      }

      if (!targetUrl) { Alert.alert('失敗しました。もう一度お試しください。'); return; }

      const once: any = await analyzeFashion(targetUrl);
      let predicted = once?.category as string | undefined;
      const ok = categories.includes((predicted as any) ?? '');
      if (!ok) {
        const twice: any = await analyzeFashion(targetUrl);
        predicted = twice?.category as string | undefined;
        if (!categories.includes((predicted as any) ?? '')) {
          Alert.alert('失敗しました。もう一度お試しください。');
          return;
        }
      }
      setCategory(predicted!);
    } catch {
      Alert.alert('失敗しました。もう一度お試しください。');
    } finally {
      setAutoPicking(false);
    }
  };

  const handleSubmit = async () => {
    if (!uid) { Alert.alert('ログインが必要です'); return; }
    if (!mainImage && !productPreview?.image) { Alert.alert('メイン画像を選択してください'); return; }

    const lat = latitude ?? 35.681236;
    const lng = longitude ?? 139.767125;

    try {
      setSubmitting(true);

      // 1) メイン画像の公開URL
      let uploadedMainUrl: string;
      if (mainImage) {
        uploadedMainUrl = await ensureImageInStorage(mainImage, uid);
      } else {
        uploadedMainUrl = await ensureImageInStorage(productPreview!.image!, uid);
      }

      // 2) 手動未選択ならAIで初期値補完
      let aiCategory: string | null = null;
      let aiLabels: any = null;
      if (!category && uploadedMainUrl) {
        try {
          const ai: any = await analyzeFashion(uploadedMainUrl);
          aiCategory = (ai?.category as string) ?? null;
          aiLabels = ai?.ai_labels ?? null;
        } catch {}
      }
      const finalCategory = category ?? aiCategory ?? null;

      // 3) caption に部位ごとの {link,image} を保存
      const meta = {
        category: finalCategory ?? '',
        parts: {
          tops: { link: links.tops || null, image: topsUrl || null },
          bottoms: { link: links.bottoms || null, image: bottomsUrl || null },
          outerwear: { link: links.outerwear || null, image: outerwearUrl || null },
          shoes: { link: links.shoes || null, image: shoesUrl || null },
        },
      };

      // 4) posts へ insert
      const payload: any = {
        owner_id: uid,
        image_url: uploadedMainUrl,
        caption: JSON.stringify(meta),
        lat, lng,
        selected_product: productPreview ?? null,
        category: finalCategory,
        ai_labels: aiLabels,
      };

      const { error } = await supabase.from('posts').insert(payload).select('id').single();
      if (error) throw new Error(error.message);

      Alert.alert('投稿しました');
      router.replace('/');
    } catch (e: any) {
      Alert.alert('投稿に失敗しました', e?.message ?? 'unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  // 部位用UI：テキスト入力は「商品ページURL」、タップで編集→フォーカス外で解決
  const PartEditor = ({
    field, label, uri, setUri,
  }: {
    field: 'tops'|'bottoms'|'outerwear'|'shoes';
    label: string;
    uri: string;
    setUri: (u: string) => void;
  }) => {
    const link = links[field] || '';
    const showImage = !!uri;

    return (
      <View style={styles.column}>
        <AppText style={styles.label}>{label}</AppText>
        <TouchableOpacity onPress={() => setEditingField(field)} activeOpacity={0.85}>
          {showImage ? (
            <ExpoImage source={{ uri: decodeThumUrl(uri) }} style={styles.itemImage} contentFit="cover" cachePolicy="none"  onError={(e)=>console.log("IMAGE_ERROR", e?.nativeEvent)} />
          ) : (
            <View style={[styles.itemImage, styles.placeholder]}>
              <AppText style={styles.placeholderText}>タップしてURL入力</AppText>
            </View>
          )}
        </TouchableOpacity>
        {editingField === field && (
          <TextInput
            style={styles.input}
            placeholder={`${label} の商品URL（例: /shop/... もOK）`}
            placeholderTextColor="#9aa"
            value={link}
            onChangeText={(t) => setLinks((p) => ({ ...p, [field]: t }))}
            onBlur={async () => { setEditingField(null); await resolvePart(field); }}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
      </View>
    );
  };

  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      <Stack.Screen options={{ headerShown:false, gestureEnabled:true, animationTypeForReplace:'pop' }} />
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={goBackSafe} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={32} color="#FF2EDA" />
        </TouchableOpacity>

        <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios' ? 'padding' : undefined}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* メイン画像 */}
            <TouchableOpacity onPress={() => pickImage(setMainImage)} activeOpacity={0.85}>
              {mainImage ? (
                <Image source={{ uri: mainImage }} style={styles.mainImage} />
              ) : (
                <View style={[styles.mainImage, styles.placeholder]}>
                  <AppText style={styles.placeholderText}>タップしてメイン画像を選択</AppText>
                </View>
              )}
            </TouchableOpacity>

            {/* 服の雰囲気 + 自動選択ボタン */}
            <View style={styles.headerRow}>
              <AppText style={styles.categoryTitle}>服の雰囲気</AppText>
              <TouchableOpacity onPress={autoPickCategory} style={styles.autoBtn} activeOpacity={0.85} disabled={autoPicking}>
                {autoPicking ? <ActivityIndicator /> : <Text style={styles.autoBtnText}>自動選択</Text>}
              </TouchableOpacity>
            </View>

            {/* 5択 */}
            <View style={styles.categoryRow}>
              {(['カジュアル','スマート','フェミニン','モード','アウトドア'] as const).map((c) => (
                <TouchableOpacity key={c}
                  style={[styles.categoryBtn, { backgroundColor: category===c ? '#FF6EF5' : '#E5C2FF' }]}
                  onPress={() => setCategory(c)}>
                  <AppText style={styles.categoryText}>{c}</AppText>
                </TouchableOpacity>
              ))}
            </View>

            {/* ===== 部位ごとの商品URL入力 → 画像挿入 ===== */}
            <View style={styles.row}>
              <PartEditor field="tops" label="Tops" uri={topsUrl} setUri={setTopsUrl} />
              <PartEditor field="bottoms" label="Bottoms/Skirt" uri={bottomsUrl} setUri={setBottomsUrl} />
            </View>
            <View style={styles.row}>
              <PartEditor field="outerwear" label="Outerwear" uri={outerwearUrl} setUri={setOuterwearUrl} />
              <PartEditor field="shoes" label="Shoes" uri={shoesUrl} setUri={setShoesUrl} />
            </View>

            {/* （任意）全体プレビュー欄は残す */}
            <View style={{ marginTop: 6 }}>
              <AppText style={styles.sectionTitle}>商品URL（任意）</AppText>
              <View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
                <TextInput
                  style={[styles.input, { flex:1, height:44 }]}
                  placeholder="https://..."
                  placeholderTextColor="#9aa"
                  value={productUrl}
                  onChangeText={setProductUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <TouchableOpacity
                  onPress={fetchProductPreview}
                  style={{ height:44, paddingHorizontal:12, borderRadius:10, backgroundColor:'#FF6EF5', alignItems:'center', justifyContent:'center' }}
                  activeOpacity={0.85}
                >
                  {loadingPreview ? <ActivityIndicator /> : <Text style={{ color:'#fff', fontWeight:'700' }}>プレビュー</Text>}
                </TouchableOpacity>
              </View>

              {productPreview && (
                <View style={{ marginTop:10, borderWidth:1, borderColor:'#eee', borderRadius:12, overflow:'hidden', backgroundColor:'#fff' }}>
                  { !!(productPreview?.image || productPreview?.url) ? (
                    <ExpoImage source={{ uri: decodeThumUrl(productPreview?.image || (productPreview?.url ? shot(productPreview.url) : "")) }}}
    style={{ width:'100%', height:240, borderRadius:12, backgroundColor:'#eee' }}
    contentFit="cover" cachePolicy="none" transition={150}  onError={(e)=>console.log("IMAGE_ERROR", e?.nativeEvent)} />
                  ) : (
                    <View style={{ width:'100%', height:200, alignItems:'center', justifyContent:'center' }}>
                      <Text style={{ color:'#888' }}>画像が取得できませんでした</Text>
                    </View>
                  )}
                  <View style={{ padding:10 }}>
                    <Text style={{ fontWeight:'700' }} numberOfLines={2}>
                      {productPreview.title || '商品'}
                    </Text>
                    {!!productPreview.price && (
                      <Text style={{ marginTop:4, color:'#666' }}>参考価格: {productPreview.price}</Text>
                    )}
                    <Text style={{ marginTop:6, color:'#888' }} numberOfLines={1}>
                      {productPreview.url}
                    </Text>
                    <View style={{ flexDirection:'row', gap:10, marginTop:10 }}>
                      <TouchableOpacity
                        onPress={() => productPreview.image && setMainImage(productPreview.image!)}
                        style={{ backgroundColor:'#FF2EDA', paddingHorizontal:12, paddingVertical:8, borderRadius:10 }}
                        activeOpacity={0.85}
                      >
                        <Text style={{ color:'#fff', fontWeight:'700' }}>メインに設定</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setProductPreview(null); setProductUrl(''); }}
                        style={{ backgroundColor:'#ddd', paddingHorizontal:12, paddingVertical:8, borderRadius:10 }}
                        activeOpacity={0.85}
                      >
                        <Text style={{ color:'#222', fontWeight:'700' }}>クリア</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* 送信ボタン */}
            <TouchableOpacity style={styles.submitButton}
              onPress={handleSubmit} disabled={submitting || autoPicking}>
              <AppText style={styles.submitText}>
                {submitting ? '投稿中…' : '投稿する'}
              </AppText>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:'#FDECF2' },
  scroll:{ flex:1 },
  content:{ padding:20, paddingBottom:40 },
  backButton:{ position:'absolute', top:50, left:20, zIndex:10 },
  mainImage:{ width:'80%', alignSelf:'center', height:180, borderRadius:16, backgroundColor:'#eee', marginBottom:16 },

  headerRow:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8, paddingHorizontal:4 },
  categoryTitle:{ fontSize:22, fontWeight:'600' },
  autoBtn:{ backgroundColor:'#FF6EF5', paddingHorizontal:14, paddingVertical:10, borderRadius:12 },
  autoBtnText:{ color:'#fff', fontWeight:'700' },

  sectionTitle:{ fontSize:22, fontWeight:'600', marginBottom:12, textAlign:'left' },

  categoryRow:{ flexDirection:'row', flexWrap:'wrap', justifyContent:'center', marginBottom:20 },
  categoryBtn:{ paddingHorizontal:16, paddingVertical:10, borderRadius:20, margin:6, minWidth:90, alignItems:'center' },
  categoryText:{ color:'#111', fontWeight:'600' },

  row:{ flexDirection:'row', justifyContent:'space-between', gap:20, width:'93%', alignSelf:'center', marginBottom:40 },
  column:{ flex:1, alignItems:'center' },
  itemImage:{  width:'100%', height:180, borderRadius:8, backgroundColor:'#eee'  },
  placeholder:{ alignItems:'center', justifyContent:'center' },
  placeholderText:{ color:'#999', fontSize:12 },
  label:{ fontSize:22, fontWeight:'600', marginBottom:10 },
  input:{ backgroundColor:'#fff', borderRadius:8, padding:10, borderWidth:1, borderColor:'#ccc' },

  submitButton:{ marginTop:10, backgroundColor:'#FF2EDA', paddingHorizontal:24, paddingVertical:12, borderRadius:24, alignItems:'center' },
  submitText:{ color:'#fff', fontWeight:'bold', fontSize:20 },
});

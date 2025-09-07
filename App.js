import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Keyboard, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import wordsData from './assets/words.json';

const STORAGE_KEY = '@kelime_quiz_state_v2';

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(str) {
  return (str || '')
    .toLocaleLowerCase('tr')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCorrect(userAnswer, truth) {
  const ua = normalize(userAnswer);
  const options = (truth || '').split('|').map(s => normalize(s));
  return options.some(opt => opt.length > 0 && ua === opt);
}

function getHint(word, revealedCount = 1) {
  if (!word) return '';
  let result = '';
  for (let i = 0; i < word.length; i++) {
    if (i < revealedCount || word[i] === ' ') {
      result += word[i];
    } else {
      result += '.';
    }
  }
  return result;
}

function syllabify(word) {
  if (!word) return '';
  return word.replace(/([aeiouy])/gi, '$1-').replace(/-$/, '');
}

export default function App() {
  const [orderedWords, setOrderedWords] = useState(() => shuffle(wordsData));
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, passed: 0 });
  const [loaded, setLoaded] = useState(false);
  const [quizMode, setQuizMode] = useState('en2tr'); // "en2tr" veya "tr2en"
  const [hintCount, setHintCount] = useState(0);
  const inputRef = useRef(null);

  const total = orderedWords.length;
  const current = orderedWords[idx] || { en: '-', tr: '-' };

  const question = quizMode === 'en2tr' ? current.en : current.tr.split('|')[0];
  const correctAnswer = quizMode === 'en2tr' ? current.tr : current.en;

  const remaining = Math.max(total - (stats.correct + stats.wrong + stats.passed), 0);

  // State yükle
  useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem(STORAGE_KEY);
        if (s) {
          const parsed = JSON.parse(s);
          let restoredOrder = parsed.orderedWords || wordsData;
          if (!Array.isArray(restoredOrder) || restoredOrder.length !== wordsData.length) {
            restoredOrder = shuffle(wordsData);
          }
          setOrderedWords(restoredOrder);
          setIdx(Math.min(parsed.idx ?? 0, restoredOrder.length - 1));
          setStats(parsed.stats || { correct: 0, wrong: 0, passed: 0 });
          setQuizMode(parsed.quizMode || 'en2tr');
        }
      } catch (e) {
        console.warn('Load error', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // State kaydet
  useEffect(() => {
    if (!loaded) return;
    const toSave = JSON.stringify({ orderedWords, idx, stats, quizMode });
    AsyncStorage.setItem(STORAGE_KEY, toSave).catch(() => {});
  }, [orderedWords, idx, stats, quizMode, loaded]);

  const onSubmit = () => {
    if (!answer.trim()) return;
    const ok = isCorrect(answer, correctAnswer);
    Keyboard.dismiss();
    if (ok) {
      setStats(s => ({ ...s, correct: s.correct + 1 }));
      goNext(true);
    } else {
      setRevealed(true);
      setStats(s => ({ ...s, wrong: s.wrong + 1 }));
    }
  };

  const onPass = () => {
    const w = current;
    const rest = orderedWords.slice(0, idx).concat(orderedWords.slice(idx + 1));
    const newOrder = rest.concat([w]);
    setOrderedWords(newOrder);
    setStats(s => ({ ...s, passed: s.passed + 1 }));
    setRevealed(false);
    setAnswer('');
    setHintCount(0);
  };

  const goNext = () => {
    const nextIdx = (idx + 1) % orderedWords.length;
    setIdx(nextIdx);
    setRevealed(false);
    setAnswer('');
    setHintCount(0);
  };

  const onReveal = () => {
    setRevealed(true);
    Keyboard.dismiss();
  };

  const onHint = () => {
    setHintCount(hintCount + 1);
  };

  const onResetProgress = () => {
    Alert.alert(
      'Sıfırla',
      'İstatistikler ve sıranız sıfırlansın mı?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet',
          style: 'destructive',
          onPress: async () => {
            const newOrder = shuffle(wordsData);
            setOrderedWords(newOrder);
            setIdx(0);
            setStats({ correct: 0, wrong: 0, passed: 0 });
            setAnswer('');
            setRevealed(false);
            setHintCount(0);
            await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
          },
        },
      ]
    );
  };

  const progress = useMemo(() => {
    const done = stats.correct + stats.wrong + stats.passed;
    return total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  }, [stats, total]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>
          {quizMode === 'en2tr' ? 'İngilizce → Türkçe' : 'Türkçe → İngilizce'} Quiz
        </Text>

        <View style={styles.progressRow}>
          <Text style={styles.progressText}>Toplam: {total}</Text>
          <Text style={styles.progressText}>Kalan: {remaining}</Text>
          <Text style={styles.progressText}>İlerleme: %{progress}</Text>
        </View>

        <View style={styles.badgesRow}>
          <Badge label="Doğru" value={stats.correct} />
          <Badge label="Yanlış" value={stats.wrong} />
          <Badge label="Pas" value={stats.passed} />
        </View>

        <View style={styles.card}>
          <Text style={styles.prompt}>Soru:</Text>
          <Text style={styles.word}>{question}</Text>

          {hintCount > 0 && (
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>İpucu: {getHint(correctAnswer, hintCount)}</Text>
            </View>
          )}
          {hintCount > 1 && (
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>Hecele: {syllabify(correctAnswer)}</Text>
            </View>
          )}

          <Text style={styles.prompt}>Cevabın:</Text>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Yaz..."
            value={answer}
            onChangeText={setAnswer}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={onSubmit}
            returnKeyType="send"
          />

          {!revealed ? (
            <View style={styles.btnRow}>
              <PrimaryButton label="Gönder" onPress={onSubmit} />
              <SecondaryButton label="Pass" onPress={onPass} />
              <SecondaryButton label="Göster" onPress={onReveal} />
              <SecondaryButton label="İpucu" onPress={onHint} />
            </View>
          ) : (
            <View style={styles.revealBox}>
              <Text style={styles.revealTitle}>Doğru cevap:</Text>
              <Text style={styles.revealAnswer}>{correctAnswer}</Text>
              <PrimaryButton label="Sonraki" onPress={goNext} />
            </View>
          )}
        </View>

        <View style={styles.footerRow}>
          <SecondaryButton label="Sıfırla" onPress={onResetProgress} />
          <SecondaryButton
            label="Karıştır"
            onPress={() => {
              const mixed = shuffle(orderedWords);
              setOrderedWords(mixed);
              setIdx(0);
              setAnswer('');
              setRevealed(false);
              setHintCount(0);
            }}
          />
          <SecondaryButton
            label="Mod Değiştir"
            onPress={() => {
              setQuizMode(quizMode === 'en2tr' ? 'tr2en' : 'en2tr');
              setAnswer('');
              setRevealed(false);
              setHintCount(0);
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Badge({ label, value }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <Text style={styles.badgeValue}>{value}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.primaryBtn}>
      <Text style={styles.primaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.secondaryBtn}>
      <Text style={styles.secondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressText: { fontSize: 14, opacity: 0.8 },
  badgesRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginVertical: 10 },
  badge: { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  badgeLabel: { fontSize: 12, opacity: 0.7 },
  badgeValue: { fontSize: 16, fontWeight: '700' },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 16, gap: 8 },
  prompt: { fontSize: 14, opacity: 0.7 },
  word: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  primaryBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#111' },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#111' },
  secondaryText: { color: '#111', fontWeight: '700' },
  revealBox: { marginTop: 12, alignItems: 'center', gap: 8 },
  revealTitle: { fontSize: 14, opacity: 0.7 },
  revealAnswer: { fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  hintBox: { marginTop: 4, alignItems: 'center' },
  hintText: { fontSize: 14, fontWeight: '600', color: '#444' }
});

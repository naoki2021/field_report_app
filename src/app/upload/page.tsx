'use client';

import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useRef, Suspense, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import SystemDiagramForm from '@/components/SystemDiagramForm';

// useSearchParams を使用するコンポーネントをラップするためのラッパーコンポーネント
function UploadPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const corporation = searchParams?.get('corporation') || "";
  const address = searchParams?.get('address') || ""; // Get address
  const documentType = searchParams?.get('documentType') || "";
  const surveySubType = searchParams?.get('surveySubType') || ""; // Get sub type
  const surveyDate = searchParams?.get('surveyDate') || "";
  const surveyor = searchParams?.get('surveyor') || "";

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceMemo, setVoiceMemo] = useState<Blob | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]); // 全てのタグ
  const [uploadedTags, setUploadedTags] = useState<Set<string>>(new Set()); // アップロード済みのタグ
  const [formKey, setFormKey] = useState(0); // To reset forms
  const [symbolsForCurrentPhoto, setSymbolsForCurrentPhoto] = useState<string[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  useEffect(() => {
    const fetchTagsAndUploadedPhotos = async () => {
      try {
        console.log('Fetching tags from /api/tags...');
        const tagsResponse = await fetch('/api/tags');
        console.log('tagsResponse.ok:', tagsResponse.ok);
        if (tagsResponse.ok) {
          const tagsData = await tagsResponse.json();
          console.log('Fetched tagsData:', tagsData);
          setAllTags(tagsData);
        } else {
          const errorData = await tagsResponse.json();
          console.error('Failed to fetch tags:', errorData.error || 'Unknown error');
          setAllTags([]);
        }
      } catch (error: unknown) {
        console.error('Failed to fetch tags (network error or JSON parse error):', error);
        setAllTags([]);
      }

      try {
        const photosRef = collection(db, 'photos');
        const q = query(
          photosRef,
          where('corporation', '==', corporation),
          where('documentType', '==', documentType),
          where('surveySubType', '==', surveySubType),
          where('surveyDate', '==', surveyDate),
          where('surveyor', '==', surveyor)
        );
        const querySnapshot = await getDocs(q);
        const tags = new Set<string>();
        querySnapshot.docs.forEach(doc => {
          tags.add(doc.data().tag);
        });
        setUploadedTags(tags);
      } catch (error) {
        console.error('Failed to fetch uploaded photos:', error);
      }
    };

    fetchTagsAndUploadedPhotos();
  }, [corporation, documentType, surveySubType, surveyDate, surveyor]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedTag) return;

    setIsUploading(true);
    const imageId = uuidv4();
    let imageUrl = '';
    let voiceMemoUrl = '';
    let transcription = '';

    try {
      const imageFormData = new FormData();
      imageFormData.append('file', selectedFile);
      imageFormData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET || '');
      imageFormData.append('folder', `field_report_app/${corporation}`);

      const cloudinaryImageResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: imageFormData,
        }
      );

      if (!cloudinaryImageResponse.ok) {
        throw new Error('Cloudinary image upload failed');
      }

      const cloudinaryImageData = await cloudinaryImageResponse.json();
      imageUrl = cloudinaryImageData.secure_url;

      if (voiceMemo) {
        const voiceMemoFormData = new FormData();
        voiceMemoFormData.append('file', voiceMemo);
        voiceMemoFormData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET || '');
        voiceMemoFormData.append('resource_type', 'raw');
        voiceMemoFormData.append('folder', `field_report_app/${corporation}/voice_memos`);

        const cloudinaryVoiceMemoResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`,
          {
            method: 'POST',
            body: voiceMemoFormData,
          }
        );

        if (!cloudinaryVoiceMemoResponse.ok) {
          throw new Error('Cloudinary voice memo upload failed');
        }

        const cloudinaryVoiceMemoData = await cloudinaryVoiceMemoResponse.json();
        voiceMemoUrl = cloudinaryVoiceMemoData.secure_url;

        const transcribeResponse = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioUrl: voiceMemoUrl }),
        });

        if (transcribeResponse.ok) {
          const transcribeData = await transcribeResponse.json();
          transcription = transcribeData.transcription || '';
        } else {
          console.error('Transcription API failed', await transcribeResponse.text());
        }
      }

      await addDoc(collection(db, "photos"), {
        imageId: imageId,
        imageUrl: imageUrl,
        voiceMemoUrl: voiceMemoUrl || null,
        transcription: transcription || null,
        tag: selectedTag,
        diagramSymbols: symbolsForCurrentPhoto, // Save associated symbols
        corporation: corporation,
        documentType: documentType,
        surveySubType: surveySubType,
        surveyDate: surveyDate,
        surveyor: surveyor,
        createdAt: Timestamp.now(),
      });

      alert('アップロードが完了しました。');
      // Reset state for next upload
      setSelectedFile(null);
      setSelectedTag("");
      setPreview(null);
      setVoiceMemo(null);
      setSymbolsForCurrentPhoto([]);
      setUploadedTags(prev => new Set(prev).add(selectedTag));
      setFormKey(prev => prev + 1); // This will also reset SystemDiagramForm

    } catch (error) {
      console.error("Upload failed", error);
      alert('アップロードに失敗しました。');
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        setVoiceMemo(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error: unknown) {
      let errorMessage = "ボイスメモの録音を開始できませんでした。";
      if (error instanceof Error) {
        errorMessage += `\n--- Technical Details ---\nName: ${error.name}\nMessage: ${error.message}`;
      }
      console.error("Error starting recording:", error);
      alert(errorMessage);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      // Stop all tracks in the stream to release the microphone
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          corporation: corporation,
          address: address,
          documentType: documentType,
          surveySubType: surveySubType,
          surveyDate: surveyDate,
          surveyor: surveyor,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const { downloadUrl, fileName } = data;

        // Create a temporary link to trigger the download
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName; // Suggest a filename to the browser
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        alert('レポートの生成リクエストが完了しました。ダウンロードを開始します。');
      } else {
        const errorData = await response.json();
        console.error('Failed to generate report:', errorData);
        alert(`レポートの生成に失敗しました: ${errorData.message}`);
      }
    } catch (error) {
      console.error('An unexpected error occurred:', error);
      alert('レポートの生成中に予期せぬエラーが発生しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGoHome = () => {
    const params = new URLSearchParams();
    params.set("corporation", corporation);
    params.set("documentType", documentType);
    params.set("surveySubType", surveySubType);
    params.set("surveyDate", surveyDate);
    params.set("surveyor", surveyor);
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">写真アップロード</h1>
      <div className="mb-4 p-4 border rounded-lg">
        <h2 className="text-xl font-semibold">調査情報</h2>
        <p>法人ID/物件名: {corporation}</p>
        <p>ドキュメント種別: {documentType} {surveySubType && `(${surveySubType})`}</p>
        <p>調査日: {surveyDate}</p>
        <p>調査員名: {surveyor}</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>写真を選択</Label>
          <div className="flex gap-2">
            <Button onClick={() => cameraInputRef.current?.click()}>写真を撮影</Button>
            <Input type="file" accept="image/*" capture="environment" onChange={handleFileChange} ref={cameraInputRef} className="hidden" />
            <Button onClick={() => fileInputRef.current?.click()}>カメラロールから選択</Button>
            <Input type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
          </div>
        </div>

        {/* Tag Selection */}
        <div className="relative z-50"> {/* Added relative z-50 */}
          <Label htmlFor="tag">タグを選択</Label>
          <Select onValueChange={setSelectedTag} value={selectedTag}>
            <SelectTrigger id="tag">
              <SelectValue placeholder="タグを選択してください" />
            </SelectTrigger>
            <SelectContent className="min-w-[var(--radix-popper-anchor-width)]"> {/* Added min-w class */}
              {allTags.map((tag) => (
                <SelectItem key={tag} value={tag} className={uploadedTags.has(tag) ? 'bg-green-100 text-green-700' : ''}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Voice Memo */}
        <div>
          <Label>ボイスメモ</Label>
          <div className="flex items-center gap-2">
            <Button onClick={handleStartRecording} disabled={isRecording}>
              {isRecording ? (
                <>
                  <span className="relative flex h-3 w-3 mr-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  録音中...
                </>
              ) : (
                '録音開始'
              )}
            </Button>
            <Button onClick={handleStopRecording} disabled={!isRecording}>録音停止</Button>
            {voiceMemo && <p className="text-sm">録音済み</p>}
          </div>
        </div>

        {/* Image preview and upload button (only shown when a file is selected) */}
        {preview && (
          <div className="p-4 border-2 border-dashed rounded-lg space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">プレビュー</h3>
              <div className="relative w-full max-w-xs h-48">
                <Image src={preview} alt="Preview" layout="fill" objectFit="contain" className="rounded-lg" />
              </div>
            </div>
            <Button onClick={handleUpload} disabled={!selectedFile || !selectedTag || isUploading} className="w-full">
              {isUploading ? 'アップロード中...' : 'この写真をアップロード'}
            </Button>
          </div>
        )}

        {/* System Diagram Symbol Selection (always visible) */}
        <div>
          <h3 className="text-lg font-semibold">系統図記号選択</h3>
          <SystemDiagramForm onSymbolsChange={setSymbolsForCurrentPhoto} resetKey={formKey} />
        </div>

        <div className="mt-8 flex justify-between">
            <Button onClick={handleGoHome} variant="outline">ホームに戻る</Button>
            <Button onClick={handleGenerateReport} disabled={isGenerating}>
              {isGenerating ? '生成中...' : 'レポート生成'}
            </Button>
        </div>
      </div>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UploadPageContent />
    </Suspense>
  );
}
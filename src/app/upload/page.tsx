'use client';

import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useRef, Suspense, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';
import SystemDiagramForm from '@/components/SystemDiagramForm';

function UploadPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const corporation = searchParams?.get('corporation') || "";
  const address = searchParams?.get('address') || "";
  const documentType = searchParams?.get('documentType') || "";
  const surveySubType = searchParams?.get('surveySubType') || "";
  const surveyDate = searchParams?.get('surveyDate') || "";
  const surveyor = searchParams?.get('surveyor') || "";

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [uploadedTags, setUploadedTags] = useState<Set<string>>(new Set());
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const tagsResponse = await fetch('/api/tags');
        if (tagsResponse.ok) setAllTags(await tagsResponse.json());
      } catch (error) { console.error('Failed to fetch tags:', error); }

      try {
        const photosRef = collection(db, 'photos');
        const q = query(photosRef, where('corporation', '==', corporation), where('documentType', '==', documentType), where('surveySubType', '==', surveySubType), where('surveyDate', '==', surveyDate), where('surveyor', '==', surveyor));
        const querySnapshot = await getDocs(q);
        const tags = new Set<string>(querySnapshot.docs.map(doc => doc.data().tag));
        setUploadedTags(tags);
      } catch (error) { console.error('Failed to fetch uploaded photos:', error); }
    };
    fetchInitialData();
  }, [corporation, documentType, surveySubType, surveyDate, surveyor, isUploading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedTag) return;
    setIsUploading(true);
    try {
      const imageFormData = new FormData();
      imageFormData.append('file', selectedFile);
      imageFormData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET || '');
      imageFormData.append('folder', `field_report_app/${corporation}`);
      const cloudinaryImageResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: imageFormData });
      if (!cloudinaryImageResponse.ok) throw new Error('Cloudinary image upload failed');
      const cloudinaryImageData = await cloudinaryImageResponse.json();

      await addDoc(collection(db, "photos"), {
        imageUrl: cloudinaryImageData.secure_url,
        tag: selectedTag,
        corporation, documentType, surveySubType, surveyDate, surveyor,
        createdAt: Timestamp.now(),
      });
      alert('アップロードが完了しました。');
      
      // Reset only photo-specific state
      setSelectedFile(null);
      setSelectedTag("");
      setPreview(null);
      
      // Update uploaded tags without a full re-fetch
      setUploadedTags(prev => new Set(prev).add(selectedTag));

    } catch (error) {
      console.error("Upload failed", error);
      alert('アップロードに失敗しました。');
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corporation, address, documentType, surveySubType, surveyDate, surveyor, diagramSymbols: selectedSymbols }),
      });
      if (response.ok) {
        const data = await response.json();
        const a = document.createElement('a');
        a.href = data.downloadUrl;
        a.download = data.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        alert('レポートの生成が完了しました。');
      } else {
        const errorData = await response.json();
        alert(`レポートの生成に失敗しました: ${errorData.message}`);
      }
    } catch {
      alert('レポートの生成中にエラーが発生しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGoHome = () => {
    const params = searchParams ? `?${searchParams.toString()}` : '';
    router.push(`/${params}`);
  };

  return (
    <main className="w-full max-w-3xl mx-auto py-8 space-y-8">
      <Card>
        <CardHeader className="p-8">
          <CardTitle className="text-2xl">調査情報</CardTitle>
          <CardDescription className="text-muted-foreground text-base pt-1">{corporation} / {surveyDate} / {surveyor}</CardDescription>
        </CardHeader>
        <CardFooter className="p-8 pt-0">
          <Button variant="outline" onClick={handleGoHome} className="w-full py-6 text-base">調査情報を変更</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader className="p-8">
          <CardTitle className="text-2xl">ステップ1: 写真のアップロード</CardTitle>
          <CardDescription className="text-muted-foreground text-base pt-1">調査箇所を撮影または選択し、対応するタグを選んでください。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button variant="secondary" onClick={() => cameraInputRef.current?.click()} className="py-6 text-base">写真を撮影</Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="py-6 text-base">ライブラリから選択</Button>
            <Input type="file" accept="image/*" capture="environment" onChange={handleFileChange} ref={cameraInputRef} className="hidden" />
            <Input type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
          </div>
          
          {preview && (
            <div className="space-y-4 pt-4">
              <div className="relative w-full h-80 rounded-lg border bg-muted/30 flex items-center justify-center">
                <Image src={preview} alt="Preview" layout="fill" objectFit="contain" className="rounded-md" />
              </div>
              <div className="form-item">
                <Label htmlFor="tag" className="form-label">タグを選択</Label>
                <Select onValueChange={setSelectedTag} value={selectedTag}>
                  <SelectTrigger id="tag" className="form-select-trigger"><SelectValue placeholder="写真に対応するタグを選択" /></SelectTrigger>
                  <SelectContent position="popper">
                    {allTags.map((tag) => (
                      <SelectItem key={tag} value={tag} className={`form-select-item ${uploadedTags.has(tag) ? 'font-bold text-primary' : ''}`}>
                        {tag} {uploadedTags.has(tag) && "(済)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
        {preview && (
          <CardFooter className="p-8 pt-0">
            <Button onClick={handleUpload} disabled={!selectedFile || !selectedTag || isUploading} className="form-submit-button">
              {isUploading ? 'アップロード中...' : 'この写真をアップロード'}
            </Button>
          </CardFooter>
        )}
      </Card>

      <Card>
        <CardHeader className="p-8">
          <CardTitle className="text-2xl">ステップ2: 系統図記号の選択</CardTitle>
          <CardDescription className="text-muted-foreground text-base pt-1">この調査で使用する全ての系統図記号を選択してください。</CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <SystemDiagramForm selectedSymbols={selectedSymbols} onSymbolsChange={setSelectedSymbols} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-8">
          <CardTitle className="text-2xl">ステップ3: レポート生成</CardTitle>
          <CardDescription className="text-muted-foreground text-base pt-1">全ての写真と記号の選択が完了したら、レポートを生成します。</CardDescription>
        </CardHeader>
        <CardFooter className="p-8">
          <Button onClick={handleGenerateReport} disabled={isGenerating} className="form-submit-button">
            {isGenerating ? '生成中...' : 'レポートを生成'}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Loading...</div>}>
      <UploadPageContent />
    </Suspense>
  );
}

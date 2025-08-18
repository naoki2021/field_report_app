'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [corporation, setCorporation] = useState("");
  const [address, setAddress] = useState("");
  const [surveyor, setSurveyor] = useState("");
  const [selectedDocumentType, setSelectedDocumentType] = useState("");
  const [surveySubType, setSurveySubType] = useState("");
  const [surveyDate, setSurveyDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    setCorporation(searchParams?.get('corporation') || "");
    setAddress(searchParams?.get('address') || "");
    setSelectedDocumentType(searchParams?.get('documentType') || "");
    setSurveySubType(searchParams?.get('surveySubType') || "");
    setSurveyDate(searchParams?.get('surveyDate') || new Date().toISOString().split('T')[0]);
    setSurveyor(searchParams?.get('surveyor') || "");
  }, [searchParams]);

  const handleNextClick = () => {
    const params = new URLSearchParams();
    params.set("corporation", corporation);
    params.set("address", address);
    params.set("documentType", selectedDocumentType);
    if (selectedDocumentType === 'survey_report') {
        params.set("surveySubType", surveySubType);
    }
    params.set("surveyDate", surveyDate);
    params.set("surveyor", surveyor);
    router.push(`/upload?${params.toString()}`);
  };

  const isNextDisabled = !corporation || !selectedDocumentType || !surveyDate || !surveyor || (selectedDocumentType === 'survey_report' && !surveySubType);

  return (
    <main className="w-full max-w-3xl space-y-8">
      <Card className="w-full">
        <CardHeader className="text-center p-8">
          <CardTitle className="text-3xl font-bold tracking-tight">Field Report</CardTitle>
          <CardDescription className="text-muted-foreground pt-2 text-base">
            調査情報を入力して、レポート作成を開始します。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8 p-8">
            <div className="flex flex-col space-y-2">
              <Label htmlFor="corporation" className="form-label">物件名 / ID</Label>
              <Input id="corporation" placeholder="例：〇〇ビル" value={corporation} onChange={(e) => setCorporation(e.target.value)} className="form-input"/>
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="address" className="form-label">住所 (任意)</Label>
              <Input id="address" placeholder="例：東京都〇〇区..." value={address} onChange={(e) => setAddress(e.target.value)} className="form-input"/>
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="documentType" className="form-label">ドキュメント種別</Label>
              <Select onValueChange={(value) => { setSelectedDocumentType(value); setSurveySubType(""); }} value={selectedDocumentType}>
                <SelectTrigger id="documentType" className="form-select-trigger"><SelectValue placeholder="選択してください" /></SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="completion_drawings" className="form-select-item">竣工図書</SelectItem>
                  <SelectItem value="survey_report" className="form-select-item">調査報告資料</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedDocumentType === 'survey_report' && (
              <div className="flex flex-col space-y-2">
                <Label htmlFor="surveySubType" className="form-label">調査種別</Label>
                <Select onValueChange={setSurveySubType} value={surveySubType}>
                  <SelectTrigger id="surveySubType" className="form-select-trigger"><SelectValue placeholder="選択してください" /></SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="FTTH" className="form-select-item">FTTH</SelectItem>
                    <SelectItem value="introduction" className="form-select-item">導入</SelectItem>
                    <SelectItem value="migration" className="form-select-item">マイグレ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col space-y-2">
              <Label htmlFor="surveyDate" className="form-label">調査日</Label>
              <Input id="surveyDate" type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} className="form-input"/>
            </div>
            <div className="flex flex-col space-y-2">
              <Label htmlFor="surveyor" className="form-label">調査員名</Label>
              <Input id="surveyor" placeholder="例：山田 太郎" value={surveyor} onChange={(e) => setSurveyor(e.target.value)} className="form-input"/>
            </div>
        </CardContent>
        <CardFooter className="p-8">
          <Button onClick={handleNextClick} disabled={isNextDisabled} className="w-full text-lg py-7">
            次へ進む
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
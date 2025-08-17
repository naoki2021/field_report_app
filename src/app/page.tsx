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

  // --- State Hooks ---
  const [corporation, setCorporation] = useState("");
  const [address, setAddress] = useState(""); // Add address state
  const [surveyor, setSurveyor] = useState("");
  const [selectedDocumentType, setSelectedDocumentType] = useState("");
  const [surveySubType, setSurveySubType] = useState(""); // For FTTH, etc.
  const [surveyDate, setSurveyDate] = useState("");

  // --- Effects ---
  // Initialize form fields from URL parameters on component mount
  useEffect(() => {
    const corporationParam = searchParams?.get('corporation');
    const addressParam = searchParams?.get('address'); // Get address
    const documentTypeParam = searchParams?.get('documentType');
    const surveySubTypeParam = searchParams?.get('surveySubType');
    const surveyDateParam = searchParams?.get('surveyDate');
    const surveyorParam = searchParams?.get('surveyor');

    if (corporationParam) setCorporation(corporationParam);
    if (addressParam) setAddress(addressParam); // Set address
    if (documentTypeParam) setSelectedDocumentType(documentTypeParam);
    if (surveySubTypeParam) setSurveySubType(surveySubTypeParam);
    if (surveyDateParam) setSurveyDate(surveyDateParam);
    if (surveyorParam) setSurveyor(surveyorParam);

  }, [searchParams]);

  // --- Handlers ---
  const handleNextClick = () => {
    const params = new URLSearchParams();
    params.set("corporation", corporation);
    params.set("address", address); // Add address
    params.set("documentType", selectedDocumentType);
    if (selectedDocumentType === 'survey_report') {
        params.set("surveySubType", surveySubType);
    }
    params.set("surveyDate", surveyDate);
    params.set("surveyor", surveyor);
    router.push(`/upload?${params.toString()}`);
  };

  // --- Render ---
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <Card className="w-[450px]">
        <CardHeader>
          <CardTitle>調査情報を入力</CardTitle>
          <CardDescription>
            法人ID/物件名、ドキュメント種別、調査日、調査員名を入力してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form>
            <div className="grid w-full items-center gap-4">
              {/* Corporation Input */}
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="corporation">法人ID/物件名</Label>
                <Input
                  id="corporation"
                  placeholder="法人IDまたは物件名を入力"
                  value={corporation}
                  onChange={(e) => setCorporation(e.target.value)}
                />
              </div>

              {/* Address Input */}
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="address">
                  住所 <span className="text-xs text-gray-500">（空欄でも可）</span>
                </Label>
                <Input
                  id="address"
                  placeholder="住所を入力"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              {/* Document Type Select */}
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="documentType">ドキュメント種別</Label>
                <Select 
                  key={`doc-type-${selectedDocumentType}`}
                  onValueChange={(value) => {
                    setSelectedDocumentType(value);
                    setSurveySubType(""); // Reset sub-type when main type changes
                  }}
                  value={selectedDocumentType || ""}
                >
                  <SelectTrigger id="documentType">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="completion_drawings">竣工図書</SelectItem>
                    <SelectItem value="survey_report">調査報告資料</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Survey Sub Type Select (Conditional) */}
              {selectedDocumentType === 'survey_report' && (
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="surveySubType">調査種別</Label>
                  <Select 
                    key={`sub-type-${surveySubType}`}
                    onValueChange={setSurveySubType} 
                    value={surveySubType || ""}
                  >
                    <SelectTrigger id="surveySubType">
                      <SelectValue placeholder="調査種別を選択" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="FTTH">FTTH</SelectItem>
                      <SelectItem value="introduction">導入</SelectItem>
                      <SelectItem value="migration">マイグレ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Survey Date Input */}
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="surveyDate">調査日</Label>
                <Input
                  id="surveyDate"
                  type="date"
                  value={surveyDate}
                  onChange={(e) => setSurveyDate(e.target.value)}
                />
              </div>

              {/* Surveyor Input */}
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="surveyor">調査員名</Label>
                <Input
                  id="surveyor"
                  placeholder="調査員名を入力"
                  value={surveyor}
                  onChange={(e) => setSurveyor(e.target.value)}
                />
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleNextClick}>
            写真アップロードへ
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

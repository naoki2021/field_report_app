import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface SymbolMapping {
  sheet: string;
  image_path: string;
  cell: string;
  width: number;
  height: number;
}

interface SystemDiagramSymbols {
  [key: string]: SymbolMapping;
}

interface SystemDiagramFormProps {
  onSymbolsChange: (symbols: string[]) => void;
  resetKey: number;
}

const SystemDiagramForm: React.FC<SystemDiagramFormProps> = ({ onSymbolsChange, resetKey }) => {
  const [availableSymbols, setAvailableSymbols] = useState<SystemDiagramSymbols>({});
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);

  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const response = await fetch('/api/system-diagram-symbols');
        if (response.ok) {
          const data: SystemDiagramSymbols = await response.json();
          setAvailableSymbols(data);
          console.log('Available Symbols fetched:', data); // Added log
        } else {
          console.error('Failed to fetch system diagram symbols:', response.statusText);
        }
      } catch (error) {
        console.error('Error fetching system diagram symbols:', error);
      }
    };

    fetchSymbols();
  }, []);

  useEffect(() => {
    setSelectedSymbols([]);
    console.log('resetKey changed, selectedSymbols reset.'); // Added log
  }, [resetKey]);

  const handleSymbolChange = (symbol: string, checked: boolean) => {
    console.log('handleSymbolChange called for symbol:', symbol, 'checked:', checked); // Added log
    const newSelectedSymbols = checked
      ? [...selectedSymbols, symbol]
      : selectedSymbols.filter((s) => s !== symbol);

    setSelectedSymbols(newSelectedSymbols);
    onSymbolsChange(newSelectedSymbols);
    console.log('New selectedSymbols:', newSelectedSymbols); // Added log
  };

  return (
    <div className="mt-4 p-4 border rounded-lg shadow-sm">
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Object.keys(availableSymbols).map((tag) => (
          <div key={tag} className="flex items-center space-x-2">
            <Checkbox
              id={tag}
              checked={selectedSymbols.includes(tag)}
              onCheckedChange={(checked) => {
                handleSymbolChange(tag, !!checked);
              }}
            />
            <Label htmlFor={tag} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              {tag}
            </Label>
          </div>
        ))}
      </div>

      {selectedSymbols.length > 0 && (
        <div className="mt-6">
          <h4 className="text-md font-semibold mb-2">選択中の記号:</h4>
          <div className="flex flex-wrap gap-4 p-2 border rounded-md bg-muted/50">
            {selectedSymbols.map((symbol) => {
              const symbolData = availableSymbols[symbol];
              console.log('Rendering symbol:', symbol, 'symbolData:', symbolData); // Added log
              if (!symbolData) return null;
              return (
                <div key={symbol} className="flex flex-col items-center gap-1">
                  <div className="relative w-12 h-12">
                    <Image
                      src={symbolData[0].image_path.replace('public/', '/')}
                      alt={symbol}
                      layout="fill"
                      objectFit="contain"
                    />
                  </div>
                  <span className="text-xs">{symbol}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemDiagramForm;

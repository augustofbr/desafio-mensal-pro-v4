import { X } from "lucide-react";

interface QrCodeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const QrCodeOverlay = ({ isOpen, onClose }: QrCodeOverlayProps) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        <X className="h-6 w-6 text-gray-600" />
      </button>

      <p className="text-xl md:text-2xl font-display font-bold text-gray-800 mb-6 px-4 text-center">
        Avalie-nos no Google!
      </p>

      <img
        src="/qr-code-avaliacao-google.jpeg"
        alt="QR Code para avaliação Google do Studio X"
        className="max-w-[90vw] max-h-[70vh] object-contain rounded-lg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export default QrCodeOverlay;

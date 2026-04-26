import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalItems, itemsPerPage, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  if (totalPages <= 1) return null;

  const pages = [];
  const maxVisiblePages = 5;
  
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-100 sm:px-6 mt-4 rounded-2xl shadow-sm">
      <div className="flex justify-between flex-1 sm:hidden">
        <button
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'text-gray-700'}`}
        >
          Önceki
        </button>
        <button
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className={`relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'text-gray-700'}`}
        >
          Sonraki
        </button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Toplam <span className="font-bold text-blue-600">{totalItems}</span> kayıttan{' '}
            <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> -{' '}
            <span className="font-medium">{Math.min(currentPage * itemsPerPage, totalItems)}</span> arası gösteriliyor
          </p>
        </div>
        <div>
          <nav className="inline-flex -space-x-px rounded-xl shadow-sm isolate" aria-label="Pagination">
            <button
              disabled={currentPage === 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="relative inline-flex items-center px-2 py-2 text-gray-400 border border-gray-200 rounded-l-xl hover:bg-gray-50 focus:z-20 disabled:opacity-50"
            >
              <span className="sr-only">Önceki</span>
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            {pages.map((page) => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold border ${page === currentPage ? 'z-10 bg-blue-600 text-white border-blue-600 focus:z-20' : 'text-gray-900 border-gray-200 hover:bg-gray-50 focus:z-20'}`}
              >
                {page}
              </button>
            ))}
            <button
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="relative inline-flex items-center px-2 py-2 text-gray-400 border border-gray-200 rounded-r-xl hover:bg-gray-50 focus:z-20 disabled:opacity-50"
            >
              <span className="sr-only">Sonraki</span>
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}

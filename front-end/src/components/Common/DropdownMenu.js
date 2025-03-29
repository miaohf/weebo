import React, { useRef, useEffect, useState } from 'react';
import './DropdownMenu.css';

function DropdownMenu({ items }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  
  // 处理点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // 渲染菜单项
  const renderMenuItem = (item) => {
    if (item.divider) {
      return <div className="dropdown-divider"></div>;
    }
    
    if (item.submenu) {
      return (
        <div className="dropdown-submenu">
          <div className="dropdown-submenu-header">
            {item.icon && <span className="dropdown-item-icon">{item.icon}</span>}
            <span className="dropdown-item-text">{item.label}</span>
          </div>
          <div className="dropdown-submenu-content">
            {item.submenu.map((subItem, subIndex) => (
              <button 
                key={subIndex}
                className={`dropdown-item ${subItem.active ? 'active' : ''}`}
                onClick={() => {
                  subItem.onClick();
                  if (!item.keepOpen) setIsOpen(false);
                }}
              >
                {subItem.color && (
                  <span 
                    className="color-option" 
                    style={{ backgroundColor: subItem.color }}
                  ></span>
                )}
                <span className="dropdown-item-text">{subItem.label}</span>
                {subItem.active && <span className="dropdown-item-check">✓</span>}
              </button>
            ))}
          </div>
        </div>
      );
    }
    
    return (
      <button 
        className={`dropdown-item ${item.active ? 'active' : ''} ${item.danger ? 'danger' : ''}`}
        onClick={() => {
          item.onClick();
          if (!item.keepOpen) setIsOpen(false);
        }}
        disabled={item.disabled}
      >
        {item.icon && <span className="dropdown-item-icon">{item.icon}</span>}
        <span className="dropdown-item-text">{item.label}</span>
        {item.active && <span className="dropdown-item-check">✓</span>}
      </button>
    );
  };
  
  return (
    <div className="dropdown-container" ref={menuRef}>
      <button 
        className={`dropdown-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="更多选项"
      >
        <span className="dots"></span>
      </button>
      
      {isOpen && (
        <div className="dropdown-menu">
          {items.map((item, index) => (
            <React.Fragment key={index}>
              {renderMenuItem(item)}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export default DropdownMenu; 
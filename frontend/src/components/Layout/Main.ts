import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Fab,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Avatar,
  Badge,
  IconButton,
  Tooltip,
  Zoom
} from '@mui/material';
import {
  Menu as MenuIcon,
  Logout as LogoutIcon,
  Dashboard,
  People,
  Security,
  Business,
  DevicesOther,
  AttachMoney,
  Notifications,
  Assessment,
  Settings,
  Close
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppSelector, useAppDispatch } from '../../hooks/redux';
import { selectAuth, logout } from '../../store/slices/authSlice';
import { hasPermission } from '../../utils/permissions';

// Estilos personalizados
const Background = styled('div')({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundImage: 'url(/images/login-background.jpeg)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
  filter: 'brightness(0.7)',
  zIndex: -2
});

const Overlay = styled('div')({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: `
    radial-gradient(circle at 20% 80%, rgba(33, 153, 234, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(19, 125, 197, 0.1) 0%, transparent 50%),
    linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(22, 33, 62, 0.95) 50%, rgba(15, 52, 96, 0.95) 100%)
  `,
  zIndex: -1
});

const MainContainer = styled(Box)({
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 1
});

const LogoHeader = styled(Box)({
  position: 'fixed',
  top: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  gap: 15,
  padding: '10px 30px',
  background: 'rgba(55, 65, 79, 0.1)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: '30px',
  border: '1px solid rgba(33, 153, 234, 0.2)',
  boxShadow: '0 8px 32px rgba(13, 15, 19, 0.3)'
});

const Logo = styled('img')({
  height: 40,
  width: 'auto',
  filter: 'drop-shadow(0 0 10px rgba(19, 125, 197, 0.5))',
  userSelect: 'none'
});

const MenuFab = styled(Fab)({
  position: 'fixed',
  bottom: 30,
  left: 30,
  background: 'linear-gradient(135deg, #137DC5, #2199ea)',
  '&:hover': {
    background: 'linear-gradient(135deg, #0f5f96, #137DC5)',
    transform: 'scale(1.05)'
  }
});

const LogoutFab = styled(Fab)({
  position: 'fixed',
  bottom: 30,
  right: 30,
  background: 'linear-gradient(135deg, #dc3545, #ff6b6b)',
  '&:hover': {
    background: 'linear-gradient(135deg, #a71e2a, #dc3545)',
    transform: 'scale(1.05)'
  }
});

const StyledMenu = styled(Menu)({
  '& .MuiPaper-root': {
    background: 'rgba(55, 65, 79, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(33, 153, 234, 0.2)',
    borderRadius: '15px',
    minWidth: 280,
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 8px 32px rgba(13, 15, 19, 0.4)',
    '&::-webkit-scrollbar': {
      width: 8
    },
    '&::-webkit-scrollbar-track': {
      background: 'rgba(255, 255, 255, 0.05)'
    },
    '&::-webkit-scrollbar-thumb': {
      background: 'rgba(33, 153, 234, 0.3)',
      borderRadius: 4
    }
  }
});

const StyledMenuItem = styled(MenuItem)({
  padding: '12px 20px',
  color: '#ffffff',
  transition: 'all 0.3s ease',
  '&:hover': {
    background: 'rgba(33, 153, 234, 0.2)',
    '& .MuiListItemIcon-root': {
      color: '#2199ea'
    }
  }
});

const ContentArea = styled(Box)({
  flex: 1,
  padding: '100px 20px 100px 20px',
  maxWidth: 1400,
  width: '100%',
  margin: '0 auto'
});

const Footer = styled(Box)({
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  padding: '15px',
  textAlign: 'center',
  background: 'rgba(55, 65, 79, 0.1)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderTop: '1px solid rgba(33, 153, 234, 0.2)',
  zIndex: 100
});

const FooterText = styled(Typography)({
  color: '#2199ea',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '2px',
  fontWeight: 500,
  opacity: 0.8
});

// Interfaz para items del menú
interface MenuItemData {
  id: string;
  label: string;
  icon: React.ReactElement;
  path: string;
  permission?: string;
  dividerAfter?: boolean;
}

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { user, permissions } = useAppSelector(selectAuth);
  
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const menuOpen = Boolean(menuAnchor);

  // Definir items del menú según permisos
  const menuItems: MenuItemData[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <Dashboard />,
      path: '/dashboard'
    },
    {
      id: 'users',
      label: 'Usuarios',
      icon: <People />,
      path: '/users',
      permission: 'users.view'
    },
    {
      id: 'permissions',
      label: 'Permisos',
      icon: <Security />,
      path: '/permissions',
      permission: 'system.permissions.manage'
    },
    {
      id: 'communities',
      label: 'Comunidades',
      icon: <Business />,
      path: '/communities',
      permission: 'communities.view',
      dividerAfter: true
    },
    {
      id: 'devices',
      label: 'Dispositivos',
      icon: <DevicesOther />,
      path: '/devices',
      permission: 'devices.view'
    },
    {
      id: 'financial',
      label: 'Finanzas',
      icon: <AttachMoney />,
      path: '/financial',
      permission: 'financial.expenses.view'
    },
    {
      id: 'notifications',
      label: 'Notificaciones',
      icon: <Notifications />,
      path: '/notifications',
      permission: 'notifications.send'
    },
    {
      id: 'reports',
      label: 'Reportes',
      icon: <Assessment />,
      path: '/reports',
      permission: 'reports.basic.view',
      dividerAfter: true
    },
    {
      id: 'settings',
      label: 'Configuración',
      icon: <Settings />,
      path: '/settings'
    }
  ];

  // Filtrar items según permisos
  const visibleMenuItems = menuItems.filter(item => 
    !item.permission || hasPermission(permissions, item.permission)
  );

  // No mostrar menú para usuarios básicos
  const showMenu = user?.role !== 'User';

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleMenuItemClick = (path: string) => {
    navigate(path);
    handleMenuClose();
  };

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  useEffect(() => {
    // Animación de entrada
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      document.body.style.overflow = 'auto';
    }, 500);
  }, []);

  return (
    <>
      <Background />
      <Overlay />
      
      <MainContainer>
        {/* Logo Header */}
        <LogoHeader>
          <Logo src="/images/logo.png" alt="SKYN3T" />
          <Box>
            <Typography
              variant="body2"
              sx={{ 
                color: '#2199ea',
                fontWeight: 600,
                letterSpacing: 1
              }}
            >
              {user?.full_name || 'Usuario'}
            </Typography>
            <Typography
              variant="caption"
              sx={{ 
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '11px'
              }}
            >
              {user?.role || 'User'}
            </Typography>
          </Box>
        </LogoHeader>

        {/* Área de contenido */}
        <ContentArea>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              style={{ height: '100%' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </ContentArea>

        {/* Footer */}
        <Footer>
          <FooterText>
            SKYN3T - IT & NETWORK SOLUTIONS © {new Date().getFullYear()}
          </FooterText>
        </Footer>

        {/* Botón de Menú (solo si tiene permisos) */}
        {showMenu && (
          <Zoom in timeout={300}>
            <MenuFab
              color="primary"
              onClick={handleMenuOpen}
              sx={{
                animation: menuOpen ? 'none' : 'pulse 2s infinite'
              }}
            >
              {menuOpen ? <Close /> : <MenuIcon />}
            </MenuFab>
          </Zoom>
        )}

        {/* Menú desplegable */}
        <StyledMenu
          anchorEl={menuAnchor}
          open={menuOpen}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'left'
          }}
          transformOrigin={{
            vertical: 'bottom',
            horizontal: 'left'
          }}
          TransitionComponent={Zoom}
        >
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Avatar
              sx={{
                width: 60,
                height: 60,
                margin: '0 auto',
                mb: 1,
                bgcolor: '#137DC5'
              }}
            >
              {user?.full_name?.charAt(0) || 'U'}
            </Avatar>
            <Typography sx={{ color: '#fff', fontWeight: 600 }}>
              {user?.full_name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              {user?.email}
            </Typography>
          </Box>
          
          <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', my: 1 }} />
          
          {visibleMenuItems.map((item, index) => (
            <React.Fragment key={item.id}>
              <StyledMenuItem
                onClick={() => handleMenuItemClick(item.path)}
                selected={location.pathname === item.path}
              >
                <ListItemIcon sx={{ color: '#2199ea', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </StyledMenuItem>
              {item.dividerAfter && (
                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', my: 1 }} />
              )}
            </React.Fragment>
          ))}
        </StyledMenu>

        {/* Botón de Logout */}
        <Zoom in timeout={300} style={{ transitionDelay: '100ms' }}>
          <LogoutFab
            color="secondary"
            size="medium"
            onClick={handleLogout}
          >
            <LogoutIcon />
          </LogoutFab>
        </Zoom>
      </MainContainer>

      <style>{`
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(33, 153, 234, 0.7);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(33, 153, 234, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(33, 153, 234, 0);
          }
        }
      `}</style>
    </>
  );
};